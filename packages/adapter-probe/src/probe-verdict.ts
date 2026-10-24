import type { PluginRelease, UnitPluginNeed } from '@dsh-workbench/shared';
import { resolvePluginSource } from '@dsh-workbench/adapter-supply';
import { isNewerVersion } from "@dsh-workbench/adapter-profile";
import type { UnitCapability, UnitCommands, UnitLibState, UnitPluginState } from "./probe-libs.js";

export function evaluateUnit(
  list: readonly unknown[] | undefined,
  unit: UnitCommands,
  failure: string | undefined,
  command = "opencli",
  releases: ReadonlyMap<string, PluginRelease> = new Map(),
  libs: readonly UnitLibState[] = [],
): UnitCapability {
  const isPlugin = (
    item: unknown,
  ): item is { name?: string; commands?: unknown[] } =>
    typeof item === "object" && item !== null;
  const needs = unit.plugins ?? [];
  const required = needs.flatMap((need) => need.commands ?? []);
  const primary = needs[0]?.name;

  if (failure !== undefined || list === undefined) {
    return {
      unit: unit.unit,
      ...(primary === undefined ? {} : { plugin: primary }),
      status: "unchecked",
      required,
      missing: [],
      detail: failure ?? "探不动",
      ...(libs.length === 0 ? {} : { libs }),
    };
  }

  const plugins = list.filter(isPlugin);
  const installed = new Map(plugins.map((item) => [String(item.name), item]));

  const states: UnitPluginState[] = needs.map((need) => {
    const hit = installed.get(need.name);

    if (hit === undefined) {
      const source = resolvePluginSource(need.installSource, process.env, {
        command,
        plugin: need.name,
      });
      return {
        name: need.name,
        status: "missing",
        missing: [],
        install: source.ok ? ("ready" as const) : source.problem,
        command: source.ok ? source.line : pluginInstallCommand(need.name),
      };
    }

    const available = new Set(
      (Array.isArray(hit.commands) ? hit.commands : []).map(String),
    );
    const missing = (need.commands ?? []).filter(
      (name) => !available.has(name),
    );
    const release = releases.get(need.name);
    const behind =
      release?.latest !== undefined &&
      isNewerVersion(release.latest, release.installed);
    const commandsBehind = missing.length > 0;
    const upgrade =
      behind && release?.latest !== undefined
        ? upgradeLine(need, command, release.latest)
        : undefined;
    return {
      name: need.name,
      status:
        commandsBehind || behind ? ("outdated" as const) : ("ok" as const),
      missing,
      ...(release === undefined ? {} : { release }),
      ...(commandsBehind || behind
        ? {
            command:
              upgrade ??
              pluginUpdateCommand(need.name) ??
              pluginInstallCommand(need.name),
          }
        : {}),
    };
  });

  const absent = states.filter((state) => state.status === "missing");
  const outdated = states.filter((state) => state.status === "outdated");
  const missing = states.flatMap((state) => state.missing);
  const libMissing = libs.filter((state) => state.status === "missing");
  const libMismatch = libs.filter((state) => state.status === "unsatisfied");
  const libBehind = libs.filter((state) => state.status === "outdated");
  const status =
    absent.length > 0 || libMissing.length > 0 || libMismatch.length > 0
      ? "missing-plugin"
      : missing.length > 0
        ? "missing-commands"
        : "ok";

  const blocked = absent.find((state) => state.install !== "ready");
  const install =
    absent.length === 0
      ?
        libMissing.length > 0 || libMismatch.length > 0
        ? ("ready" as const)
        : undefined
      : blocked === undefined
        ? ("ready" as const)
        : blocked.install;
  const fix =
    status === "missing-plugin"
      ? install === "ready"
        ? ("install" as const)
        : undefined
      : outdated.length > 0 || libBehind.length > 0
        ? ("update" as const)
        : undefined;

  const first =
    absent[0] ?? outdated[0] ?? libMissing[0] ?? libMismatch[0] ?? libBehind[0];
  const gaps = [...(missing.length === 0 ? [] : [`缺必需：${missing.join("、")}`])];
  const newer = states.filter(
    (state) =>
      state.release?.latest !== undefined &&
      isNewerVersion(state.release.latest, state.release.installed),
  );
  const versionText =
    newer.length === 0
      ? ""
      : `（源上有新版：${newer.map((state) => `${state.release?.installed ?? ""} → ${state.release?.latest ?? ""}`).join("、")}）`;
  const absentNames = [
    ...absent.map((state) => state.name),
    ...libMissing.map((state) => state.name),
  ];
  const mismatchText = libMismatch.map((state) => {
    const declared = unit.libs?.find((need) => need.name === state.name)?.version?.trim();
    return `${state.name}（装的是 ${state.installed ?? "未知"}，声明要 ${declared === undefined || declared === "" ? "任意版本" : declared}）`;
  });

  return {
    unit: unit.unit,
    ...(primary === undefined ? {} : { plugin: primary }),
    status,
    required,
    missing,
    detail:
      absentNames.length > 0 || mismatchText.length > 0
        ? [
            ...(absentNames.length === 0
              ? []
              : [`${plugins.length} 个已装插件里没有 ${absentNames.join("、")}`]),
            ...mismatchText,
          ].join("；")
        : `${needs.length} 份安装都在${gapsText(gaps)}${versionText}${
            libs.length === 0
              ? ""
              : `；交叉依赖：${libs.map((state) => `${state.name}${state.installed === undefined ? " 未装" : ` ${state.installed}`}`).join("、")}${libBehind.length === 0 ? "" : "（源上有新版）"}`
          }`,
    ...(fix === undefined && first === undefined
      ? {}
      : { command: fix === "install" ? (absent[0] ?? first)?.command : first?.command }),
    ...(fix === undefined ? {} : { fix }),
    ...(install === undefined ? {} : { install }),
    plugins: states,
    ...(libs.length === 0 ? {} : { libs }),
  };
}

export function gapsText(gaps: readonly string[]): string {
  return gaps.length === 0 ? "" : `（${gaps.join("；")}）`;
}

export function pluginUpdateCommand(
  plugin: string | undefined,
): string | undefined {
  return plugin === undefined ? undefined : `opencli plugin update ${plugin}`;
}

export function pluginInstallCommand(plugin: string | undefined): string {
  return `opencli plugin install <${plugin ?? "插件"}源>`;
}

export function upgradeLine(
  need: UnitPluginNeed,
  command: string,
  latest: string,
): string | undefined {
  const source = resolvePluginSource(need.installSource, process.env, {
    command,
    plugin: need.name,
    version: latest,
    mode: "update",
  });
  return source.ok ? source.line : undefined;
}
