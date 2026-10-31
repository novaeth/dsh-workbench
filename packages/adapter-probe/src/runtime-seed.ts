import type { spawn } from 'node:child_process';
import { execa } from 'execa';
import { toolchainManifestOf } from '@dsh-workbench/adapter-runtime';
import { createRequire } from 'node:module';
import writeFileAtomic from 'write-file-atomic';
import {
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { delimiter, dirname, join, sep } from 'node:path';
import type { DshHomePath, DshHostContext } from '@dsh-workbench/shared';
import { quoteShellArg, quoteShellArgFor } from '@dsh-workbench/shared/host';
import {
  desktopPnpmPath,
  desktopPnpmVersion,
  ensureToolchain,
  localNpmCache,
  localPnpmCommand,
  provisionLocalPnpmSync,
} from './toolchain.js';

export type SeedLog = (message: string) => void;

export interface RuntimeSeedPaths {
  readonly root: string;
  readonly entryDir: string;
  readonly opencliRoot: string;
  readonly opencliBinDir: string;
  readonly opencliBin: string;
  readonly opencliHome: string;
  readonly workshop: string;
  readonly workshopPackages: string;
  readonly workshopManifest: string;
}

export interface RuntimeSeedOptions {
  readonly root: string;
  readonly home: string;
  readonly packageRoot: string;
  readonly platform?: NodeJS.Platform | undefined;
  readonly log?: SeedLog;
}

export function opencliBinName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'opencli.cmd' : 'opencli';
}

export function runtimeSeedPaths(root: string, platform: NodeJS.Platform = process.platform): RuntimeSeedPaths {
  const opencliRoot = join(root, 'opencli');
  const opencliBinDir = join(opencliRoot, 'bin');
  const workshop = join(root, 'diy');
  return {
    root,
    entryDir: join(root, 'bin'),
    opencliRoot,
    opencliBinDir,
    opencliBin: join(opencliBinDir, opencliBinName(platform)),
    opencliHome: join(opencliRoot, 'home'),
    workshop,
    workshopPackages: join(workshop, 'packages'),
    workshopManifest: join(workshop, 'package.json'),
  };
}

export function runtimeSeedRootOf(ctx: DshHostContext): string | null {
  const configured = process.env.DSH_WORKBENCH_HOME?.trim();
  if (configured !== undefined && configured !== '') return configured;
  const homePath = ctx.get<DshHomePath>('dshHomePath');
  if (typeof homePath !== 'function') return null;
  try {
    return homePath('workbench');
  } catch {
    return null;
  }
}

export function coversWritableRoot(workspaceRoot: string, root: string): boolean {
  const prefix = workspaceRoot.endsWith(sep) ? workspaceRoot : `${workspaceRoot}${sep}`;
  return root === workspaceRoot || root.startsWith(prefix);
}

export function warnUnwritableRoot(ctx: DshHostContext): void {
  const root = runtimeSeedRootOf(ctx);
  if (root === null) return;
  const workspaceRoot = ctx.get<{ readonly workspaceRoot?: string }>('sandboxPolicy')?.workspaceRoot;
  if (workspaceRoot === undefined || coversWritableRoot(workspaceRoot, root)) return;
  ctx.logger?.warn?.(
    `[dsh-workbench] 可写根 ${workspaceRoot} 盖不住 ${root}：市场装插件、自举命令可能被沙箱挡（把 profile/sandbox.patch.yml 那一行写进这个 profile 的 cordis.patch.yml 再重启）`,
  );
}

export function wrapperRootOf(fallbackRoot: string): string {
  try {
    return dirname(createRequire(import.meta.url).resolve('@dsh-workbench/adapter-runtime/package.json'));
  } catch {
    return fallbackRoot;
  }
}

export function isInstalledCopy(packageRoot: string): boolean {
  return packageRoot.split(sep).includes('node_modules');
}

export function opencliWrapperScript(
  packageRoot: string,
  home: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const script = join(wrapperRootOf(packageRoot), 'bin', 'opencli-isolated.mjs');
  if (platform === 'win32') {
    return `@echo off\r\nset "DSH_HOME=${home}"\r\nnode "${script}" %*\r\n`;
  }
  return `#!/bin/sh\nexport DSH_HOME=${quoteShellArg(home)}\nexec node ${quoteShellArg(script)} "$@"\n`;
}

export const runtimeWrapperScript = opencliWrapperScript;

export interface SeedCommand {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly log: string;
}

export function workshopSeedPlan(
  packageRoot: string,
  home: string,
  root: string,
  platform: NodeJS.Platform = process.platform,
): { readonly entry: SeedCommand; readonly full: SeedCommand } {
  const script = join(packageRoot, 'scripts', 'seed-workshop.sh');
  const env = { DSH_HOME: home, DSH_WB_SHELL_ROOT: packageRoot };
  const log = join(root, 'seed.log');
  if (platform === 'win32') {
    const launcher = join(packageRoot, 'bin', 'seed-workshop-windows.mjs');
    const windowsEnv = { ...env, ELECTRON_RUN_AS_NODE: '1' };
    return {
      entry: { file: process.execPath, args: [launcher, 'entry', script], env: windowsEnv, log },
      full: { file: process.execPath, args: [launcher, 'full', script], env: windowsEnv, log },
    };
  }
  return {
    entry: { file: 'bash', args: [script, 'entry'], env, log },
    full: { file: 'bash', args: [script], env, log },
  };
}

const execaSpawn = ((file: string, args: readonly string[], options: object) =>
  execa(file, [...args], { ...options, reject: false })) as unknown as typeof spawn;

export function runDetached(
  command: SeedCommand,
  onError: SeedLog,
  spawnImpl: typeof spawn = execaSpawn,
): void {
  let fd: number | null = null;
  try {
    fd = openSync(command.log, 'a');
    const child = spawnImpl(command.file, [...command.args], {
      env: { ...process.env, ...command.env },
      detached: true,
      stdio: ['ignore', fd, fd],
    });
    child.on('error', (error: unknown) => onError(`自举脚本没跑起来（${command.file}）：${String(error)}`));
    child.unref();
  } catch (error) {
    onError(`自举脚本没跑起来（${command.file}）：${String(error)}`);
  } finally {
    if (fd !== null) closeQuietly(fd);
  }
}

function closeQuietly(fd: number): void {
  try {
    closeSync(fd);
  } catch {
    return;
  }
}

export function prependPath(entryDir: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const parts = (env.PATH ?? '').split(delimiter).filter((part) => part !== '');
  if (parts.includes(entryDir)) return false;
  env.PATH = [entryDir, ...parts].join(delimiter);
  return true;
}

export function seedWorkbenchToolchain(root: string, log: SeedLog): void {
  const bundledPnpm = desktopPnpmPath();
  const bundledMajor = Number(desktopPnpmVersion()?.split('.')[0] ?? '0');
  const bundledUsable = bundledPnpm !== undefined && bundledMajor >= 10;
  if (bundledPnpm !== undefined && bundledUsable) {
    process.env.DSH_WB_PNPM = `node ${quoteShellArgFor(bundledPnpm, process.platform)}`;
    log(`pnpm 用 Desktop 自带的：${bundledPnpm}`);
  } else if (bundledPnpm !== undefined) {
    log(`Desktop 自带 pnpm 版本低于 10，优先用 PATH 上的 pnpm`);
  }
  const toolchain = ensureToolchain({ root, log });
  for (const file of toolchain.files) log(`工具链写下 ${file}`);
  if (toolchain.pathDir !== undefined && prependPath(toolchain.pathDir)) {
    log(`PATH 前插 ${toolchain.pathDir}`);
  }
  if (toolchain.npmDir !== undefined) {
    if (prependPath(toolchain.npmDir)) log(`PATH 前插 ${toolchain.npmDir}`);
    if (process.env.npm_config_cache === undefined) {
      process.env.npm_config_cache = localNpmCache(root);
    }
  }
  if (toolchain.pnpmDir !== undefined) {
    if (prependPath(toolchain.pnpmDir)) log(`PATH 前插 ${toolchain.pnpmDir}`);
    if (!bundledUsable) process.env.DSH_WB_PNPM = localPnpmCommand(root);
  } else if (!bundledUsable && toolchain.pathDir !== undefined) {
    const installed = provisionLocalPnpmSync({ root });
    if (installed.ok && installed.binDir !== undefined) {
      if (prependPath(installed.binDir)) log(`PATH 前插 ${installed.binDir}`);
      process.env.DSH_WB_PNPM = localPnpmCommand(root);
      log(`工具链 provision ${installed.detail}`);
    } else {
      log(`本地 pnpm 10 没装成：${installed.detail}`);
    }
  }
}

export function seedRuntimeFiles(options: RuntimeSeedOptions): readonly string[] {
  const platform = options.platform ?? process.platform;
  const paths = runtimeSeedPaths(options.root, platform);
  const done: string[] = [];
  try {
    for (const dir of [paths.entryDir, paths.opencliBinDir, paths.opencliHome, paths.workshopPackages]) {
      mkdirSync(dir, { recursive: true });
    }
    const manifest = join(paths.opencliRoot, 'toolchain', 'package.json');
    mkdirSync(dirname(manifest), { recursive: true });
    if (readText(manifest) !== toolchainManifestOf()) {
      writeFileAtomic.sync(manifest, toolchainManifestOf(), 'utf8');
      done.push(manifest);
    }
    rmSync(join(paths.opencliRoot, 'toolchain', 'pnpm-workspace.yaml'), { force: true });
    const wanted = opencliWrapperScript(options.packageRoot, options.home, platform);
    if (readText(paths.opencliBin) !== wanted) {
      rmSync(paths.opencliBin, { force: true });
      writeFileAtomic.sync(paths.opencliBin, wanted, 'utf8');
      chmodSync(paths.opencliBin, 0o755);
      done.push(paths.opencliBin);
    }
  } catch (error) {
    options.log?.(`自举没做完：${String(error)}`);
  }
  return done;
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}
