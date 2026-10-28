import type {
  BinNeed,
  EnvNeed,
  ExtensionNeed,
  Need,
  NeedState,
  PluginRelease,
  SupplySource,
  UnitCapability,
} from '@dsh-workbench/shared/host';
import { binInstallCommand, needIdOf, quoteShellArg } from '@dsh-workbench/shared/host';
import { resolvePluginSource } from '@dsh-workbench/adapter-supply';
import { isNewerVersion } from '@dsh-workbench/adapter-profile';
import { currentHostOs } from './platform.js';

const RANK: Readonly<Record<NeedState['status'], number>> = {
  ok: 0,
  unchecked: 1,
  outdated: 2,
  unsatisfied: 3,
  missing: 4,
};

export function pluginUpdateCommand(plugin: string | undefined): string | undefined {
  return plugin === undefined
    ? undefined
    : `${quoteShellArg('opencli')} plugin update ${quoteShellArg(plugin)}`;
}


export function upgradeLine(
  need: ExtensionNeed,
  command: string,
  latest: string,
  sources: readonly SupplySource[],
): string | undefined {
  for (const source of sources) {
    const resolved = resolvePluginSource(source, process.env, {
      command,
      plugin: need.name,
      version: latest,
      mode: 'update',
    });
    if (resolved.ok) return resolved.line;
  }
  return undefined;
}

function firstResolvable(
  need: ExtensionNeed,
  command: string,
  sources: readonly SupplySource[],
): { readonly provision: NeedState['provision']; readonly command?: string } {
  let problem: NeedState['provision'] = 'not-declared';
  for (const source of sources) {
    const resolved = resolvePluginSource(source, process.env, { command, plugin: need.name });
    if (resolved.ok) return { provision: 'ready', command: resolved.line };
    problem = resolved.problem;
  }
  return { provision: problem };
}

export function extensionStateOf(options: {
  readonly need: ExtensionNeed;
  readonly hit?: { readonly commands?: unknown } | undefined;
  readonly failure?: string | undefined;
  readonly command: string;
  readonly release?: PluginRelease | undefined;
  readonly sources: readonly SupplySource[];
}): NeedState {
  const base = { id: needIdOf(options.need), kind: 'extension' as const, name: options.need.name };
  if (options.failure !== undefined) {
    return { ...base, status: 'unchecked', detail: options.failure };
  }
  if (options.hit === undefined) {
    const resolved = firstResolvable(options.need, options.command, options.sources);
    return {
      ...base,
      status: 'missing',
      detail: `已装插件里没有 ${options.need.name}`,
      provision: resolved.provision,
      ...(resolved.command === undefined ? {} : { command: resolved.command }),
    };
  }
  const available = new Set(
    (Array.isArray(options.hit.commands) ? options.hit.commands : []).map(String),
  );
  const missing = (options.need.commands ?? []).filter((name) => !available.has(name));
  const release = options.release;
  const behind =
    release?.latest !== undefined && isNewerVersion(release.latest, release.installed);
  const outdated = missing.length > 0 || behind;
  const upgrade =
    behind && release?.latest !== undefined
      ? upgradeLine(options.need, options.command, release.latest, options.sources)
      : undefined;
  return {
    ...base,
    status: outdated ? 'outdated' : 'ok',
    detail: outdated
      ? missing.length > 0
        ? `${options.need.name} 缺 ${missing.length} 条命令：${missing.join('、')}`
        : `${options.need.name} 装的是 ${release?.installed ?? '未知'}，源上最新 ${release?.latest ?? '未知'}`
      : `${options.need.name} 的命令都在`,
    ...(missing.length === 0 ? {} : { missing }),
    ...(release?.installed === undefined ? {} : { installed: release.installed }),
    ...(release?.latest === undefined ? {} : { latest: release.latest }),
    ...(outdated || behind
      ? {
          command:
            upgrade ?? pluginUpdateCommand(options.need.name),
        }
      : {}),
  };
}

export function binStateOf(need: BinNeed, present: boolean): NeedState {
  const base: NeedState = {
    id: needIdOf(need),
    kind: 'bin',
    name: need.name,
    status: present ? 'ok' : 'missing',
    detail: present ? `${need.name} 命令在` : `这台机器上找不到 ${need.name} 命令（PATH 里没有）`,
  };
  if (present) return base;
  const command = binInstallCommand(need, currentHostOs());
  if (command === undefined) return base;
  return { ...base, command, provision: 'ready' };
}

export function envStateOf(need: EnvNeed, value: string | undefined): NeedState {
  const present = value !== undefined && value.trim() !== '';
  return {
    id: needIdOf(need),
    kind: 'env',
    name: need.name,
    status: present ? 'ok' : 'missing',
    detail: present
      ? `${need.name} 已设置`
      : `环境变量 ${need.name} 没设${need.secret === true ? '（值不会被任何界面回显）' : ''}`,
    ...(need.secret === true ? { secret: true } : {}),
  };
}

export function aggregate(unit: string, needs: readonly Need[], states: readonly NeedState[]): UnitCapability {
  const required = new Set(
    needs.filter((need) => need.required !== false).map((need) => needIdOf(need)),
  );
  let worst: NeedState['status'] = 'ok';
  for (const state of states) {
    if (!required.has(state.id)) continue;
    if (RANK[state.status] > RANK[worst]) worst = state.status;
  }
  const optionalGap = states.some((state) => state.status !== 'ok' && !required.has(state.id));
  const status: UnitCapability['status'] =
    worst === 'ok'
      ? optionalGap
        ? 'degraded'
        : 'ok'
      : worst === 'missing' || worst === 'unsatisfied'
        ? 'missing'
        : worst;
  const first = states.find((state) => state.status !== 'ok');
  return {
    unit,
    status,
    needs: [...states],
    detail: first === undefined ? '依赖都齐了' : first.detail,
  };
}
