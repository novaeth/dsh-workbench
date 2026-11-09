import { join } from 'node:path';
import type { SupplySource } from '@dsh-workbench/shared';
import type {
  PluginPlanStep,
  PluginSourceOptions,
  ResolvedPluginSource,
} from '@dsh-workbench/shared';
import { npmRegistryOf, planLineOf, quoteShellArg } from '@dsh-workbench/shared/host';
import {
  pnpmIsolationFlags,
  storeDirFor,
  toolchainOpencliDir,
  vendorPeerLink,
  vendorPrefix,
} from '@dsh-workbench/adapter-runtime';

export type {
  PluginSourceOptions,
  ResolvedPluginSource,
} from '@dsh-workbench/shared';
export { npmRegistryOf } from '@dsh-workbench/shared/host';

function envValue(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false } {
  const value = env[name]?.trim();
  return value === undefined || value === '' ? { ok: false } : { ok: true, value };
}

function installOne(command: string, spec: string): ResolvedPluginSource {
  const line = `${quoteShellArg(command)} plugin install ${quoteShellArg(spec)}`;
  return { ok: true, steps: [{ kind: 'run', line }], line };
}

function pluginPackageOf(source: SupplySource, plugin: string): string {
  if (source.kind === 'npm') {
    const pkg = source.package?.trim() ?? '';
    if (pkg !== '') return pkg;
    return plugin.trim() === '' ? '' : `opencli-plugin-${plugin.trim()}`;
  }
  if (source.kind === 'git') return source.url.trim();
  return '';
}

function npmSource(
  source: SupplySource & { kind: 'npm' },
  env: Readonly<Record<string, string | undefined>>,
  options: PluginSourceOptions,
): ResolvedPluginSource {
  const registry = npmRegistryOf(source, env);
  if (!registry.ok) return { ok: false, problem: 'env-missing', env: registry.env };

  const { command = 'opencli', plugin = '', version = 'latest', mode = 'install' } = options;
  const name = pluginPackageOf(source, plugin);
  if (name === '') return { ok: false, problem: 'malformed' };

  const prefix = vendorPrefix();
  const pnpm = process.env.DSH_WB_PNPM?.trim() || 'pnpm';
  const dirInPrefix = join(prefix, 'node_modules', name);
  const peer = vendorPeerLink();

  const steps: PluginPlanStep[] = [
    {
      kind: 'run',
      line: [
        `${pnpm} add`,
        `--dir ${quoteShellArg(prefix)}`,
        quoteShellArg(`${name}@${version}`),
        `--registry ${quoteShellArg(registry.value)}`,
        `--store-dir ${quoteShellArg(storeDirFor(prefix))}`,
        pnpmIsolationFlags(),
        `--allow-build=${quoteShellArg(name)}`,
      ].join(' '),
    },
    { kind: 'remove', path: peer.dir },
    { kind: 'mkdir', path: peer.parent },
    { kind: 'link', target: toolchainOpencliDir(), path: peer.dir },
  ];

  if (mode === 'install') {
    if (plugin !== '') {
      steps.push({
        kind: 'run',
        line: `${quoteShellArg(command)} plugin uninstall ${quoteShellArg(plugin)}`,
        optional: true,
      });
    }
    steps.push({
      kind: 'run',
      line: `${quoteShellArg(command)} plugin install ${quoteShellArg(dirInPrefix)}`,
      env: { NPM_CONFIG_REGISTRY: registry.value },
    });
  }

  return { ok: true, steps, line: planLineOf(steps) };
}

export function resolvePluginSource(
  source: SupplySource | undefined,
  env: Readonly<Record<string, string | undefined>>,
  options: PluginSourceOptions = {},
): ResolvedPluginSource {
  if (source === undefined) return { ok: false, problem: 'not-declared' };

  const command = options.command ?? 'opencli';
  if (source.kind === 'git') {
    const url = source.url.trim();
    return url === '' ? { ok: false, problem: 'malformed' } : installOne(command, url);
  }
  if (source.kind === 'npm') return npmSource(source, env, options);

  const value = source.env === undefined ? { ok: false as const } : envValue(env, source.env);
  if (value.ok) return installOne(command, value.value);
  if (source.path !== undefined && source.path.trim() !== '') return installOne(command, source.path.trim());
  return { ok: false, problem: 'env-missing', env: source.env ?? '' };
}
