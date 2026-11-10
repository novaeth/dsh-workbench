import { quoteShellArg } from '@dsh-workbench/shared/host';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hostSurface } from './platform.js';

export interface SelfUpdateCli {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export interface SelfUpdateProcess {
  readonly execPath: string;
  readonly argv: readonly string[];
  readonly versions: { readonly electron?: string | undefined; readonly node?: string | undefined };
}

const PATH_DSH: SelfUpdateCli = { file: 'dsh', args: [], env: {} };

export function isPathDsh(cli: SelfUpdateCli): boolean {
  return cli.file === PATH_DSH.file && cli.args.length === 0 && Object.keys(cli.env).length === 0;
}

export function quoted(value: string): string {
  return quoteShellArg(value);
}

export function cliCommand(cli: SelfUpdateCli): string {
  const env = Object.entries(cli.env)
    .map(([key, value]) => `${key}=${quoted(value)}`)
    .join(' ');
  const command = [cli.file, ...cli.args].map(quoted).join(' ');
  return env === '' ? command : `env ${env} ${command}`;
}

export function desktopSelfUpdateCli(
  proc: SelfUpdateProcess = process,
  exists: (path: string) => boolean = existsSync,
): SelfUpdateCli | undefined {
  if (hostSurface({ proc }).deployment !== 'desktop') return undefined;
  const entry = proc.argv[1];
  if (entry === undefined || !/dsh-desktop-host[\\/]lib[\\/]index\.js$/.test(entry)) return undefined;
  const cli = join(dirname(entry), 'cli.js');
  if (!exists(cli)) return undefined;
  return {
    file: proc.execPath,
    args: ['--expose-internals', cli],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

export function desktopPnpmEntry(
  proc: SelfUpdateProcess = process,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (hostSurface({ proc }).deployment !== 'desktop') return undefined;
  const entry = proc.argv[1];
  if (entry === undefined) return undefined;
  const cut = entry.lastIndexOf('app.asar');
  if (cut <= 0) return undefined;
  const candidate = join(
    entry.slice(0, cut),
    'runtime',
    'primary-runtime',
    'dependencies',
    'pnpm',
    'bin',
    'pnpm.mjs',
  );
  return exists(candidate) ? candidate : undefined;
}

export function selfUpdateCliFor(
  profile: string,
  proc: SelfUpdateProcess = process,
  exists: (path: string) => boolean = existsSync,
): SelfUpdateCli {
  const surface = hostSurface({ proc, profile });
  if (surface.capabilities.selfUpdateCli !== 'desktop-cli') return PATH_DSH;
  return desktopSelfUpdateCli(proc, exists) ?? PATH_DSH;
}
