import { execaSync } from 'execa';
import lockfile from 'proper-lockfile';
import writeFileAtomic from 'write-file-atomic';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { quoteShellArg, quoteShellArgFor } from '@dsh-workbench/shared/host';
import { hostSurface } from './platform.js';

export interface ToolchainProcess {
  readonly versions: { readonly electron?: string | undefined; readonly node?: string | undefined };
  readonly execPath: string;
  readonly resourcesPath?: string | undefined;
}

export interface PnpmProcess {
  readonly versions: { readonly electron?: string | undefined; readonly node?: string | undefined };
  readonly resourcesPath?: string | undefined;
}

export function desktopPnpmPath(
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (hostSurface({ proc }).deployment !== 'desktop') return undefined;
  const resources = proc.resourcesPath;
  if (resources === undefined || resources === '') return undefined;
  const path = join(resources, 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.cjs');
  return exists(path) ? path : undefined;
}

export function desktopPnpmVersion(proc: PnpmProcess = process, exists: (path: string) => boolean = existsSync): string | undefined {
  if (hostSurface({ proc }).deployment !== 'desktop') return undefined;
  const resources = proc.resourcesPath;
  if (resources === undefined || resources === '') return undefined;
  const manifest = join(resources, 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'package.json');
  if (!exists(manifest)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

export interface ToolchainOptions {
  readonly root: string;
  readonly proc?: ToolchainProcess | undefined;
  readonly platform?: NodeJS.Platform | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

export interface ToolchainResult {
  readonly pathDir?: string | undefined;
  readonly npmDir?: string | undefined;
  readonly pnpmDir?: string | undefined;
  readonly files: readonly string[];
}

export const LOCAL_NPM_VERSION = [10, 9, 4].join('.');
export const LOCAL_PNPM_VERSION = [10, 32, 1].join('.');

export function localNpmRoot(root: string): string {
  return join(root, 'npm');
}

export function localNpmBin(root: string): string {
  return join(localNpmRoot(root), 'node_modules', '.bin');
}

export function localNpmCache(root: string): string {
  return join(root, 'npm-cache');
}

export function localNpmCommand(root: string, platform: NodeJS.Platform = process.platform): string {
  return join(localNpmBin(root), platform === 'win32' ? 'npm.cmd' : 'npm');
}

export function localNpmInstallCommand(
  root: string,
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const pnpm = desktopPnpmPath(proc, exists);
  if (pnpm === undefined) return undefined;
  return (
    `node ${quoteShellArgFor(pnpm, platform)} add --dir ${quoteShellArgFor(localNpmRoot(root), platform)} ` +
    `npm@${LOCAL_NPM_VERSION} --store-dir ${quoteShellArgFor(join(root, 'npm-store'), platform)}`
  );
}

export interface LocalNpmProvision {
  readonly ok: boolean;
  readonly detail: string;
  readonly binDir?: string | undefined;
}

export async function provisionLocalNpm(options: {
  readonly root: string;
  readonly run: (command: string) => Promise<{ ok: boolean; detail: string }>;
  readonly installed?: (() => boolean) | undefined;
  readonly platform?: NodeJS.Platform | undefined;
  readonly proc?: PnpmProcess | undefined;
  readonly exists?: ((path: string) => boolean) | undefined;
}): Promise<LocalNpmProvision> {
  const command = localNpmInstallCommand(
    options.root,
    options.proc ?? process,
    options.exists ?? existsSync,
  );
  if (command === undefined) return { ok: false, detail: '找不到 Desktop 自带 pnpm，装不了本地 npm' };
  try {
    mkdirSync(localNpmRoot(options.root), { recursive: true });
  } catch (error) {
    return { ok: false, detail: `建不了 ${localNpmRoot(options.root)}：${String(error)}` };
  }
  const result = await options.run(command);
  if (!result.ok) return { ok: false, detail: result.detail };
  const platform = options.platform ?? process.platform;
  const installed = options.installed?.() ?? existsSync(localNpmCommand(options.root, platform));
  if (!installed) return { ok: false, detail: 'pnpm 跑完但本地 npm 不在' };
  return {
    ok: true,
    binDir: localNpmBin(options.root),
    detail: `npm@${LOCAL_NPM_VERSION} 装到 ${localNpmRoot(options.root)}`,
  };
}

export function localPnpmRoot(root: string): string {
  return join(root, 'pnpm-10');
}

export function localPnpmBin(root: string): string {
  return join(localPnpmRoot(root), 'node_modules', '.bin');
}

export function localPnpmCommand(root: string, platform: NodeJS.Platform = process.platform): string {
  return join(localPnpmBin(root), platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
}

export function localPnpmInstallCommand(
  root: string,
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const pnpm = desktopPnpmPath(proc, exists);
  if (pnpm === undefined) return undefined;
  return (
    `node ${quoteShellArgFor(pnpm, platform)} add --dir ${quoteShellArgFor(localPnpmRoot(root), platform)} ` +
    `pnpm@${LOCAL_PNPM_VERSION} --store-dir ${quoteShellArgFor(join(root, 'pnpm-store'), platform)}`
  );
}

export interface LocalPnpmProvision {
  readonly ok: boolean;
  readonly detail: string;
  readonly binDir?: string | undefined;
}

export async function provisionLocalPnpm(options: {
  readonly root: string;
  readonly run: (command: string) => Promise<{ ok: boolean; detail: string }>;
  readonly installed?: (() => boolean) | undefined;
  readonly platform?: NodeJS.Platform | undefined;
  readonly proc?: PnpmProcess | undefined;
  readonly exists?: ((path: string) => boolean) | undefined;
  readonly pnpm?: string | undefined;
  readonly npm?: string | undefined;
}): Promise<LocalPnpmProvision> {
  const platform = options.platform ?? process.platform;
  const bootstrap = options.pnpm?.trim();
  const pnpmCommand =
    bootstrap === undefined || bootstrap === ''
      ? localPnpmInstallCommand(options.root, options.proc ?? process, options.exists ?? existsSync)
      : `${bootstrap} add --dir ${quoteShellArgFor(localPnpmRoot(options.root), platform)} pnpm@${LOCAL_PNPM_VERSION} --store-dir ${quoteShellArgFor(join(options.root, 'pnpm-store'), platform)}`;
  const npm = options.npm?.trim();
  const npmCommand =
    npm === undefined || npm === ''
      ? undefined
      : `${npm} install --prefix ${quoteShellArgFor(localPnpmRoot(options.root), platform)} pnpm@${LOCAL_PNPM_VERSION} --cache ${quoteShellArgFor(join(options.root, 'npm-cache'), platform)} --no-audit --no-fund`;
  const commands = [pnpmCommand, npmCommand].filter((item): item is string => item !== undefined);
  if (commands.length === 0) return { ok: false, detail: '找不到可用的 pnpm 或 npm，装不了本地 pnpm 10' };
  try {
    mkdirSync(localPnpmRoot(options.root), { recursive: true });
  } catch (error) {
    return { ok: false, detail: `建不了 ${localPnpmRoot(options.root)}：${String(error)}` };
  }
  let detail = '';
  for (const command of commands) {
    const result = await options.run(command);
    if (result.ok) {
      const installed = options.installed?.() ?? existsSync(localPnpmCommand(options.root, platform));
      if (installed) {
        return {
          ok: true,
          binDir: localPnpmBin(options.root),
          detail: `pnpm@${LOCAL_PNPM_VERSION} 装到 ${localPnpmRoot(options.root)}`,
        };
      }
      detail = 'pnpm 跑完但本地 pnpm 10 不在';
    } else {
      detail = result.detail;
    }
  }
  return { ok: false, detail };
}

export function provisionLocalPnpmSync(options: {
  readonly root: string;
  readonly run?: ((command: string) => void) | undefined;
  readonly installed?: (() => boolean) | undefined;
  readonly platform?: NodeJS.Platform | undefined;
  readonly proc?: PnpmProcess | undefined;
  readonly exists?: ((path: string) => boolean) | undefined;
}): LocalPnpmProvision {
  const command = localPnpmInstallCommand(
    options.root,
    options.proc ?? process,
    options.exists ?? existsSync,
  );
  if (command === undefined) return { ok: false, detail: '找不到 Desktop 自带 pnpm，装不了本地 pnpm 10' };
  try {
    mkdirSync(localPnpmRoot(options.root), { recursive: true });
  } catch (error) {
    return { ok: false, detail: `建不了 ${localPnpmRoot(options.root)}：${String(error)}` };
  }
  try {
    const run =
      options.run ??
      ((line: string) => {
        execaSync(line, { stdio: 'ignore', timeout: 180_000, env: process.env, shell: true });
      });
    run(command);
  } catch (error) {
    return { ok: false, detail: String(error) };
  }
  const platform = options.platform ?? process.platform;
  const installed = options.installed?.() ?? existsSync(localPnpmCommand(options.root, platform));
  if (!installed) return { ok: false, detail: 'pnpm 跑完但本地 pnpm 10 不在' };
  return {
    ok: true,
    binDir: localPnpmBin(options.root),
    detail: `pnpm@${LOCAL_PNPM_VERSION} 装到 ${localPnpmRoot(options.root)}`,
  };
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function desktopNodeBinary(
  proc: ToolchainProcess = process,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (hostSurface({ proc }).deployment !== 'desktop') return undefined;
  const resources = proc.resourcesPath;
  if (resources === undefined || resources === '') return undefined;
  const path = join(
    resources,
    'runtime',
    'primary-runtime',
    'dependencies',
    'node',
    'bin',
    platform === 'win32' ? 'node.exe' : 'node',
  );
  return exists(path) ? path : undefined;
}

export function desktopNodeShim(
  proc: ToolchainProcess = process,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (proc.versions.electron === undefined) return undefined;
  const node = desktopNodeBinary(proc, platform, exists);
  if (platform === 'win32') {
    return node === undefined
      ? `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${proc.execPath}" %*\r\n`
      : `@echo off\r\n"${node}" %*\r\n`;
  }
  return node === undefined
    ? `#!/bin/sh\nexec env ELECTRON_RUN_AS_NODE=1 ${quoteShellArg(proc.execPath)} "$@"\n`
    : `#!/bin/sh\nexec ${quoteShellArg(node)} "$@"\n`;
}

export function toolchainBinDir(root: string): string {
  return join(root, 'bin', 'desktop');
}

export function ensureToolchain(options: ToolchainOptions): ToolchainResult {
  const platform = options.platform ?? process.platform;
  const shim = desktopNodeShim(options.proc ?? process, platform);
  if (shim === undefined) return { files: [] };
  const pathDir = toolchainBinDir(options.root);
  const file = join(pathDir, platform === 'win32' ? 'node.cmd' : 'node');
  const files: string[] = [];
  let release: (() => void) | undefined;
  try {
    mkdirSync(pathDir, { recursive: true });
    release = lockfile.lockSync(pathDir, { realpath: false });
    if (readText(file) !== shim) {
      rmSync(file, { force: true });
      writeFileAtomic.sync(file, shim, 'utf8');
      chmodSync(file, 0o755);
      files.push(file);
    }
  } catch (error) {
    options.log?.(`工具链 shim 没写成：${String(error)}`);
    return { files };
  } finally {
    release?.();
  }
  const npmDir = existsSync(localNpmCommand(options.root, platform)) ? localNpmBin(options.root) : undefined;
  const pnpmDir = existsSync(localPnpmCommand(options.root, platform)) ? localPnpmBin(options.root) : undefined;
  return {
    pathDir,
    ...(npmDir === undefined ? {} : { npmDir }),
    ...(pnpmDir === undefined ? {} : { pnpmDir }),
    files,
  };
}
