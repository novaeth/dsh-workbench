import { commandNamesMatch } from './command-name.js';
import {
  OPENCLI_TIMEOUT_MS,
  PROBE_TTL_MS,
  buildSupplyIndex,
  NEED_KIND_SPECS,
  needIdOf,
  noWrite,
  npmSourceOf,
  parseJsonLoose,
  productWrite,
  quoteShellArg,
  type Seam,
  type ExtensionNeed,
  type LibNeed,
  type NeedProbeInput,
  type NeedState,
  type PluginRelease,
  type SupplyIndex,
  type UnitCapability,
} from '@dsh-workbench/shared/host';
import { npmRegistryOf } from '@dsh-workbench/adapter-supply';
import { probeRelease } from './release-port.js';
import { createTimedMemo } from './probe-cache.js';
import { probeLibs } from './probe-libs.js';
import { aggregate, binStateOf, envStateOf, extensionStateOf } from './probe-verdict.js';

export type {
  NeedProbeInput,
  NeedState,
  UnitCapability,
} from '@dsh-workbench/shared/host';

const BINARY_PROBE_TIMEOUT_MS = 5_000;
const KNOWN_RUNTIMES: readonly string[] = ['opencli'];

export function parsePluginList(stdout: string): unknown[] | undefined {
  const parsed = parseJsonLoose(stdout);
  if (Array.isArray(parsed)) return parsed;
  return /no plugins? installed/i.test(stdout) ? [] : undefined;
}

async function probeBinary(seam: Seam, name: string): Promise<boolean> {
  const line =
    process.platform === 'win32' ? `where ${quoteShellArg(name)}` : `command -v ${quoteShellArg(name)}`;
  const result = await seam
    .run({ command: line, intent: noWrite(), retry: 'safe', timeoutMs: BINARY_PROBE_TIMEOUT_MS, bestEffort: true })
    .catch(() => undefined);
  return result?.exitCode === 0;
}

interface RuntimeProbe {
  readonly list?: readonly unknown[] | undefined;
  readonly failure?: string | undefined;
}

async function runtimeList(options: {
  seam: Seam;
  command: string;
  needsPlugins: boolean;
}): Promise<RuntimeProbe> {
  if (!options.needsPlugins) return {};
  const result = await options.seam
    .run({
      command: `${options.command} plugin list -f json`,
      intent: productWrite(),
      retry: 'safe',
      timeoutMs: OPENCLI_TIMEOUT_MS,
    })
    .then(
    (value) => ({
      ok: true as const,
      exitCode: value.exitCode,
      timedOut: value.timedOut,
      stdout: value.stdout,
      stderr: value.stderr,
    }),
    (error: unknown) => ({ ok: false as const, problem: String(error) }),
  );
  if (!result.ok) return { failure: `plugin list 没跑起来：${result.problem}` };
  if (result.timedOut) {
    return { failure: `plugin list 超过 ${String(Math.round(OPENCLI_TIMEOUT_MS / 1000))} 秒没返回` };
  }
  if (result.exitCode !== 0) {
    const tail = `${result.stderr}\n${result.stdout}`.trim().split('\n').slice(-3).join(' | ');
    return {
      failure: `plugin list 退出码 ${String(result.exitCode)}${tail === '' ? '' : `：${tail}`}`,
    };
  }
  const list = parsePluginList(result.stdout);
  return list === undefined ? { failure: 'plugin list 的输出读不懂（不是 JSON 数组）' } : { list };
}

function conflictOf(index: SupplyIndex, need: ExtensionNeed | LibNeed): string | undefined {
  const entry = index.entryOf(need.kind, need.name);
  if (entry?.conflicted !== true) return undefined;
  const conflict = index.conflicts.find(
    (item) => item.names.includes(need.name) && item.key === entry.key,
  );
  return conflict?.detail ?? '来源声明有冲突';
}

async function releasesOf(
  index: SupplyIndex,
  options: { seam: Seam; force: boolean },
): Promise<ReadonlyMap<string, PluginRelease>> {
  const found = new Map<string, PluginRelease>();
  for (const entry of index.entries.values()) {
    if (entry.kind !== 'extension' || entry.conflicted) continue;
    const source = npmSourceOf(entry.sources);
    if (source === undefined) continue;
    const registry = npmRegistryOf(source, process.env);
    const signal = await probeRelease({
      seam: options.seam,
      package: entry.package,
      ...(registry.ok ? { registry: registry.value } : {}),
      force: options.force,
    });
    if (signal === undefined) continue;
    for (const name of entry.names) found.set(`${entry.runtime ?? 'opencli'}:${name}`, signal);
  }
  return found;
}

const pendingProbes = new Map<string, Promise<UnitCapability[]>>();

function cacheKeyOf(commandKey: string, units: readonly NeedProbeInput[], unit: string): string {
  const scope = units.map((one) => one.unit).sort().join('|');
  return `${commandKey}:${scope}:${unit}`;
}

function runtimeCommandOf(
  need: ExtensionNeed,
  runtimeCommands: Readonly<Record<string, string>>,
): string | undefined {
  const resolved = runtimeCommands[need.runtime];
  if (resolved !== undefined && resolved.trim() !== '') return resolved;
  return KNOWN_RUNTIMES.includes(need.runtime) ? need.runtime : undefined;
}

export async function probeUnits(options: {
  seam: Seam;
  runtimeCommands: Readonly<Record<string, string>>;
  units: readonly NeedProbeInput[];
  force?: boolean;
}): Promise<UnitCapability[]> {
  const { seam, runtimeCommands, units, force = false } = options;
  const commandKey = Object.values(runtimeCommands).sort().join('|');

  const hits = units.map((unit) => unitCache.get(cacheKeyOf(commandKey, units, unit.unit)));
  if (!force && hits.every((hit) => hit !== undefined)) {
    return hits as UnitCapability[];
  }

  const key = `${commandKey}:${units.map((unit) => unit.unit).join('|')}`;
  if (!force) {
    const shared = pendingProbes.get(key);
    if (shared !== undefined) return shared;
  }

  const task = loadCapabilities({ seam, runtimeCommands, units, force });
  pendingProbes.set(key, task);
  try {
    return await task;
  } finally {
    if (pendingProbes.get(key) === task) pendingProbes.delete(key);
  }
}

async function loadCapabilities(options: {
  seam: Seam;
  runtimeCommands: Readonly<Record<string, string>>;
  units: readonly NeedProbeInput[];
  force: boolean;
}): Promise<UnitCapability[]> {
  const { seam, runtimeCommands, units, force } = options;
  const index = buildSupplyIndex(units.map((unit) => ({ id: unit.unit, needs: unit.needs })), {
    env: process.env,
    packagePrefix: 'opencli-plugin-',
  });

  const binNames = [
    ...new Set(
      units.flatMap((unit) =>
        unit.needs.filter((need) => need.kind === 'bin').map((need) => need.name.trim()).filter((name) => name !== ''),
      ),
    ),
  ];
  const binaries = new Map<string, boolean>();
  const runtimeNames = Object.values(runtimeCommands);
  await Promise.all(
    binNames.map(async (name) => {
      const known = runtimeNames.some((command) => commandNamesMatch(name, command));
      binaries.set(name, known ? true : await probeBinary(seam, name));
    }),
  );

  const extensionNeeds = units.flatMap((unit) =>
    unit.needs.filter((need): need is ExtensionNeed => need.kind === 'extension'),
  );
  const runtimes = [...new Set(extensionNeeds.map((need) => need.runtime))];
  const lists = new Map<string, RuntimeProbe>();
  await Promise.all(
    runtimes.map(async (runtime) => {
      const command = runtimeCommands[runtime] ?? (KNOWN_RUNTIMES.includes(runtime) ? runtime : undefined);
      if (command === undefined) {
        lists.set(runtime, { failure: `工作台还不认识运行时 ${runtime}（没有对应的探法）` });
        return;
      }
      const needsPlugins = extensionNeeds.some(
        (need) => need.runtime === runtime && conflictOf(index, need) === undefined,
      );
      lists.set(runtime, await runtimeList({ seam, command, needsPlugins }));
    }),
  );

  const libNeeds = units.flatMap((unit) =>
    unit.needs.filter((need): need is LibNeed => need.kind === 'lib'),
  );
  const libStates = await probeLibs({ needs: libNeeds, seam, force, index });
  const releases = await releasesOf(index, { seam, force });

  const statesOfUnit = (unit: NeedProbeInput): NeedState[] =>
    unit.needs.map((need): NeedState => {
      const conflict = need.kind === 'extension' || need.kind === 'lib' ? conflictOf(index, need) : undefined;
      if (conflict !== undefined) {
        return {
          id: needIdOf(need),
          kind: need.kind,
          name: need.name,
          status: 'unchecked',
          detail: `来源冲突：${conflict}`,
        };
      }
      const probeClass = NEED_KIND_SPECS[need.kind].probe;
      if (probeClass === 'bin' && need.kind === 'bin') return binStateOf(need, binaries.get(need.name) === true);
      if (probeClass === 'env' && need.kind === 'env') return envStateOf(need, process.env[need.name]);
      if (probeClass === 'package' && need.kind === 'lib') {
        return (
          libStates.get(need.name) ?? {
            id: needIdOf(need),
            kind: 'lib',
            name: need.name,
            status: 'unchecked',
            detail: '这个共用依赖没进这一轮探测',
          }
        );
      }
      if (need.kind !== 'extension') {
        return {
          id: needIdOf(need),
          kind: need.kind,
          name: need.name,
          status: 'unchecked',
          detail: '这个种类没有对应的探法 —— 升级工作台',
        };
      }
      const probe = lists.get(need.runtime) ?? { failure: '没跑这一轮探测' };
      const command = runtimeCommandOf(need, runtimeCommands) ?? need.runtime;
      const hit = probe.list?.find(
        (item): item is { readonly commands?: unknown } =>
          typeof item === 'object' && item !== null && String((item as { name?: unknown }).name) === need.name,
      );
      return extensionStateOf({
        need,
        ...(probe.list === undefined ? {} : { hit }),
        ...(probe.failure === undefined ? {} : { failure: probe.failure }),
        command,
        ...(releases.get(`${need.runtime}:${need.name}`) === undefined
          ? {}
          : { release: releases.get(`${need.runtime}:${need.name}`) }),
        sources: index.sourcesOf('extension', need.name),
      });
    });

  return units.map((unit) => {
    const capability = aggregate(unit.unit, unit.needs, statesOfUnit(unit));
    unitCache.set(cacheKeyOf(Object.values(runtimeCommands).sort().join('|'), units, unit.unit), capability);
    return capability;
  });
}

export async function probeUnitCommands(options: {
  seam: Seam;
  runtimeCommands?: Readonly<Record<string, string>> | undefined;
  unit: NeedProbeInput;
  force?: boolean;
  catalog?: readonly NeedProbeInput[];
}): Promise<UnitCapability> {
  const units = options.catalog === undefined ? [options.unit] : options.catalog;
  const all = await probeUnits({
    seam: options.seam,
    runtimeCommands: options.runtimeCommands ?? {},
    units,
    ...(options.force === undefined ? {} : { force: options.force }),
  });
  const found = all.find((item) => item.unit === options.unit.unit);
  return (
    found ?? aggregate(options.unit.unit, options.unit.needs, [])
  );
}

const unitCache = createTimedMemo<UnitCapability>(PROBE_TTL_MS);

export const resetProbeCache = (): void => {
  unitCache.clear();
  pendingProbes.clear();
};
