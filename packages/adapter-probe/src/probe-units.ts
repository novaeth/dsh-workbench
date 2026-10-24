import type { DshShell } from '@dsh-workbench/shared';
import { OPENCLI_TIMEOUT_MS, PROBE_TTL_MS } from '@dsh-workbench/shared/host';
import { createTimedMemo } from "./probe-cache.js";
import { parseJsonLoose } from '@dsh-workbench/shared/host';
import { npmRegistryOf } from "@dsh-workbench/adapter-supply";
import { probeRelease } from "@dsh-workbench/adapter-profile";
import type { PluginRelease } from '@dsh-workbench/shared/host';
import { probeLibs } from "./probe-libs.js";
import type { UnitCapability, UnitCommands, UnitLibState } from "@dsh-workbench/shared/host";
import { evaluateUnit } from "./probe-verdict.js";
import { runShell } from '@dsh-workbench/shared/host';

export type { UnitCapability, UnitCommands, UnitLibState, UnitPluginState } from "@dsh-workbench/shared/host";

export function parsePluginList(stdout: string): unknown[] | undefined {
  const parsed = parseJsonLoose(stdout);
  if (Array.isArray(parsed)) return parsed;
  return /no plugins? installed/i.test(stdout) ? [] : undefined;
}

async function probeReleases(
  units: readonly UnitCommands[],
  options: { shell: DshShell; force: boolean },
): Promise<ReadonlyMap<string, PluginRelease>> {
  const needs = new Map<
    string,
    { readonly package: string; readonly registryEnv: string }
  >();
  for (const unit of units) {
    for (const need of unit.plugins ?? []) {
      const source = need.installSource;
      if (source?.kind === "npm") needs.set(need.name, source);
    }
  }

  const found = new Map<string, PluginRelease>();
  for (const [plugin, source] of needs) {
    const registry = npmRegistryOf(source, process.env);
    const signal = await probeRelease({
      shell: options.shell,
      package: source.package,
      ...(registry.ok ? { registry: registry.value } : {}),
      force: options.force,
    });
    if (signal !== undefined) found.set(plugin, signal);
  }
  return found;
}

export async function probeUnitCommands(options: {
  shell: DshShell;
  command?: string;
  unit: UnitCommands;
  force?: boolean;
}): Promise<UnitCapability> {
  const all = await probeUnits({ ...options, units: [options.unit] });
  return (
    all[0] ??
    evaluateUnit(
      undefined,
      options.unit,
      "unchecked",
      options.command ?? "opencli",
    )
  );
}

const pendingProbes = new Map<string, Promise<UnitCapability[]>>();

export async function probeUnits(options: {
  shell: DshShell;
  command?: string;
  units: readonly UnitCommands[];
  force?: boolean;
}): Promise<UnitCapability[]> {
  const { shell, command = "opencli", units, force = false } = options;

  const hits = units.map((unit) => unitCache.get(`${command}:${unit.unit}`));
  if (!force && hits.every((hit) => hit !== undefined)) {
    return hits as UnitCapability[];
  }

  const key = `${command}:${units.map((unit) => unit.unit).join("|")}`;
  if (!force) {
    const shared = pendingProbes.get(key);
    if (shared !== undefined) return shared;
  }

  const task = loadCapabilities({ shell, command, units, force });
  pendingProbes.set(key, task);
  try {
    return await task;
  } finally {
    if (pendingProbes.get(key) === task) pendingProbes.delete(key);
  }
}

async function loadCapabilities(options: {
  shell: DshShell;
  command: string;
  units: readonly UnitCommands[];
  force: boolean;
}): Promise<UnitCapability[]> {
  const { shell, command, units, force } = options;

  const result = await runShell(shell, `${command} plugin list -f json`, {
    timeoutMs: OPENCLI_TIMEOUT_MS,
  }).then(
    (value) => ({
      kind: "ok" as const,
      stdout: value.exitCode === 0 ? value.stdout : "",
      stderr: value.stderr,
    }),
    (error: unknown) => ({
      kind: "error" as const,
      stdout: "",
      stderr: String(error),
    }),
  );

  const list =
    result.kind === "ok" ? parsePluginList(result.stdout) : undefined;
  const failure =
    result.kind === "error"
      ? result.stderr
      : list === undefined
        ? "plugin list 的输出读不懂（不是 JSON 数组）"
        : undefined;

  if (failure !== undefined) {
    return units.map((unit) => {
      const capability: UnitCapability = {
        unit: unit.unit,
        ...(unit.plugins?.[0] === undefined
          ? {}
          : { plugin: unit.plugins[0].name }),
        status: "unchecked",
        required: (unit.plugins ?? []).flatMap((need) => need.commands ?? []),
        missing: [],
        detail: failure,
      };
      unitCache.set(`${command}:${unit.unit}`, capability);
      return capability;
    });
  }

  const [releases, libs] = await Promise.all([
    probeReleases(units, { shell, force }),
    probeLibs({
      needs: units.flatMap((unit) => unit.libs ?? []),
      shell,
      force,
    }),
  ]);

  return units.map((unit) => {
    const capability = evaluateUnit(list, unit, undefined, command, releases, libsOfUnit(unit, libs));
    unitCache.set(`${command}:${unit.unit}`, capability);
    return capability;
  });
}

function libsOfUnit(
  unit: UnitCommands,
  libs: ReadonlyMap<string, UnitLibState>,
): readonly UnitLibState[] {
  return (unit.libs ?? [])
    .map((need) => libs.get(need.name))
    .filter((state): state is UnitLibState => state !== undefined);
}

const unitCache = createTimedMemo<UnitCapability>(PROBE_TTL_MS);

export const resetProbeCache = (): void => {
  unitCache.clear();
  pendingProbes.clear();
};
