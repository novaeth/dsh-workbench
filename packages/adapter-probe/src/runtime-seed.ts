import { toolchainManifestOf, toolchainNpmrcOf } from '@dsh-workbench/adapter-runtime';
import { createRequire } from 'node:module';

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { delimiter, dirname, join, sep } from 'node:path';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import { pathWithBinsOf, quoteShellArg, quoteShellArgFor, workbenchRoot, writeTextFile } from '@dsh-workbench/shared/host';
import type { Seam } from '@dsh-workbench/shared/host';
import {
  desktopBundledBins,
  desktopNodeExecutable,
  desktopPnpmPath,
  desktopPnpmVersion,
  ensureToolchain,
  localNpmCache,
  localPnpmCommand,
  provisionLocalPnpm,
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

export function runtimeSeedRootOf(_ctx: DshHostContext): string | null {
  return workbenchRoot();
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
  nodeExecutable?: string | undefined,
): string {
  const script = join(wrapperRootOf(packageRoot), 'bin', 'opencli-isolated.mjs');
  const node = nodeExecutable === undefined || nodeExecutable === '' ? 'node' : nodeExecutable;
  if (platform === 'win32') {
    return `@echo off\r\nset "DSH_HOME=${home}"\r\n"${node}" "${script}" %*\r\n`;
  }
  return `#!/bin/sh\nexport DSH_HOME=${quoteShellArg(home)}\nexec ${quoteShellArg(node)} ${quoteShellArg(script)} "$@"\n`;
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

export interface DetachedOptions {
  readonly label?: string | undefined;
  readonly what?: string | undefined;
}

export function runDetached(
  command: SeedCommand,
  onError: SeedLog,
  seam?: Seam | undefined,
  options: DetachedOptions = {},
): boolean {
  const what = options.what ?? '自举脚本';
  if (seam === undefined) {
    onError(`${what}没跑起来（${command.file}）：宿主没给执行缝`);
    return false;
  }
  try {
    const handle = seam.spawn({
      target: { argv: [command.file, ...command.args] },
      intent: { kind: 'host' },
      lifetime: 'host',
      logFile: command.log,
      env: command.env,
      label: options.label ?? 'seed',
    });
    handle.onError((error) => onError(`${what}没跑起来（${command.file}）：${String(error)}`));
    return true;
  } catch (error) {
    onError(`${what}没跑起来（${command.file}）：${String(error)}`);
    return false;
  }
}

export function prependPath(entryDir: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const parts = (env.PATH ?? '').split(delimiter).filter((part) => part !== '');
  if (parts.includes(entryDir)) return false;
  env.PATH = pathWithBinsOf(env.PATH, [entryDir]);
  return true;
}

export async function seedWorkbenchToolchain(
  root: string,
  log: SeedLog,
  seam?: Seam | undefined,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  for (const dir of desktopBundledBins()) {
    if (prependPath(dir)) log(`PATH 前插 Desktop 自带 ${dir}`);
  }
  const bundledPnpm = desktopPnpmPath();
  const bundledMajor = Number(desktopPnpmVersion()?.split('.')[0] ?? '0');
  const bundledUsable = bundledPnpm !== undefined && bundledMajor >= 10;
  if (bundledPnpm !== undefined && bundledUsable) {
    const bundledNode = desktopNodeExecutable();
    const nodePrefix = bundledNode === undefined ? 'node' : quoteShellArgFor(bundledNode, platform);
    process.env.DSH_WB_PNPM = `${nodePrefix} ${quoteShellArgFor(bundledPnpm, platform)}`;
    log(`pnpm 用 Desktop 自带的：${bundledPnpm}（node: ${nodePrefix}）`);
  } else if (bundledPnpm !== undefined) {
    log(`Desktop 自带 pnpm 版本低于 10，优先用 PATH 上的 pnpm`);
  }
  const toolchain = ensureToolchain({ root, log, platform });
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
    if (!bundledUsable) process.env.DSH_WB_PNPM = quoteShellArgFor(localPnpmCommand(root, platform), platform);
  } else if (!bundledUsable && toolchain.pathDir !== undefined) {
    const installed = await provisionLocalPnpm({ root, seam, platform });
    if (installed.ok && installed.binDir !== undefined) {
      if (prependPath(installed.binDir)) log(`PATH 前插 ${installed.binDir}`);
      process.env.DSH_WB_PNPM = quoteShellArgFor(localPnpmCommand(root, platform), platform);
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
      writeTextFile(manifest, toolchainManifestOf());
      done.push(manifest);
    }
    rmSync(join(paths.opencliRoot, 'toolchain', 'pnpm-workspace.yaml'), { force: true });
    const npmrc = join(paths.opencliRoot, 'toolchain', '.npmrc');
    if (readText(npmrc) !== toolchainNpmrcOf()) {
      writeTextFile(npmrc, toolchainNpmrcOf());
      done.push(npmrc);
    }
    const nodeShim = join(paths.opencliRoot, 'bin', 'desktop', platform === 'win32' ? 'node.cmd' : 'node');
    const wanted = opencliWrapperScript(
      options.packageRoot,
      options.home,
      platform,
      existsSync(nodeShim) ? nodeShim : undefined,
    );
    if (readText(paths.opencliBin) !== wanted) {
      rmSync(paths.opencliBin, { force: true });
      writeTextFile(paths.opencliBin, wanted, { mode: 0o755 });
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
