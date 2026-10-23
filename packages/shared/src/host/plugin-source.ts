import type { PluginSource } from '../api/unit.js';
import { quoteShellArg } from './shell-text.js';
import { npmCacheDir, toolchainOpencliDir, vendorPeerLink, vendorPrefix } from '../host/opencli-runtime.js';

export type PluginSourceProblem =
  | "not-declared"
  | "env-missing"
  | "malformed";

export interface PluginSourceCommand {
  readonly line: string;
  readonly optional?: true;
}

export type ResolvedPluginSource =
  | {
      readonly ok: true;
      readonly commands: readonly PluginSourceCommand[];
      readonly line: string;
    }
  | {
      readonly ok: false;
      readonly problem: PluginSourceProblem;
      readonly env?: string;
    };

export interface PluginSourceOptions {
  readonly command?: string;
  readonly plugin?: string;
  readonly version?: string;
  readonly mode?: "install" | "update";
}

function mergeLines(commands: readonly PluginSourceCommand[]): string {
  return commands
    .map((item) =>
      item.optional === true ? `(${item.line} || true)` : item.line,
    )
    .join(" && ");
}

function envValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false } {
  const value = env[name]?.trim();
  return value === undefined || value === ""
    ? { ok: false }
    : { ok: true, value };
}

export function npmRegistryOf(
  source: { readonly registryEnv: string; readonly registryDefault?: string },
  env: Readonly<Record<string, string | undefined>>,
): { readonly ok: true; readonly value: string } | { readonly ok: false } {
  const fromEnv = envValue(env, source.registryEnv);
  if (fromEnv.ok) return fromEnv;
  const fallback = source.registryDefault?.trim();
  return fallback === undefined || fallback === ""
    ? { ok: false }
    : { ok: true, value: fallback };
}

function installOne(command: string, spec: string): ResolvedPluginSource {
  const line = `${quoteShellArg(command)} plugin install ${quoteShellArg(spec)}`;
  return { ok: true, commands: [{ line }], line };
}

function npmSource(
  source: {
    readonly package: string;
    readonly registryEnv: string;
    readonly registryDefault?: string;
  },
  env: Readonly<Record<string, string | undefined>>,
  options: PluginSourceOptions,
): ResolvedPluginSource {
  const registry = npmRegistryOf(source, env);
  if (!registry.ok)
    return { ok: false, problem: "env-missing", env: source.registryEnv };

  const name = source.package.trim();
  if (name === "") return { ok: false, problem: "malformed" };

  const {
    command = "opencli",
    plugin = "",
    version = "latest",
    mode = "install",
  } = options;
  const prefix = vendorPrefix();
  const dirInPrefix = `${prefix}/node_modules/${name}`;
  const peer = vendorPeerLink();

  const commands: PluginSourceCommand[] = [
    {
      line: [
        "npm i",
        `--prefix ${quoteShellArg(prefix)}`,
        quoteShellArg(`${name}@${version}`),
        `--registry ${quoteShellArg(registry.value)}`,
        `--cache ${quoteShellArg(npmCacheDir())}`,
      ].join(" "),
    },
    {
      line: `rm -rf ${quoteShellArg(peer.dir)} && mkdir -p ${quoteShellArg(peer.parent)} && ln -s ${quoteShellArg(toolchainOpencliDir())} ${quoteShellArg(peer.dir)}`,
    },
  ];

  if (mode === "install") {
    if (plugin !== "") {
      commands.push({
        line: `${quoteShellArg(command)} plugin uninstall ${quoteShellArg(plugin)}`,
        optional: true,
      });
    }
    commands.push({
      line: `NPM_CONFIG_REGISTRY=${quoteShellArg(registry.value)} ${quoteShellArg(command)} plugin install ${quoteShellArg(dirInPrefix)}`,
    });
  }

  return { ok: true, commands, line: mergeLines(commands) };
}

export function resolvePluginSource(
  source: PluginSource | undefined,
  env: Readonly<Record<string, string | undefined>>,
  options: PluginSourceOptions = {},
): ResolvedPluginSource {
  if (source === undefined) return { ok: false, problem: "not-declared" };

  const command = options.command ?? "opencli";
  if (source.kind === "git") {
    const url = source.url.trim();
    return url === ""
      ? { ok: false, problem: "malformed" }
      : installOne(command, url);
  }
  if (source.kind === "npm") return npmSource(source, env, options);

  const value = envValue(env, source.env);
  return value.ok
    ? installOne(command, value.value)
    : { ok: false, problem: "env-missing", env: source.env };
}
