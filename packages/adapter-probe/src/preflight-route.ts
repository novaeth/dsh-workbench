import { existsSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { RuntimeCapabilities } from '@dsh-workbench/shared';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { RouteTable } from '@dsh-workbench/shared/host';
import { PREFLIGHT_INSTALL_TIMEOUT_MS, preflightHandler, quoteShellArgFor, type Seam, workbenchRoot } from '@dsh-workbench/shared/host';
import { isOpencliReady, isOpencliReadyAt, opencliBuiltAt, opencliPackageDir, storeDirFor, toolchainDir } from '@dsh-workbench/adapter-runtime';
import { WAKE_BROWSER_ROUTE } from '@dsh-workbench/shared/contract/protocol/preflight-wake';
import { runBootstrapCommand } from './bootstrap-run.js';
import { createDiyPresetProbe } from './diy-preset-health.js';
import { installIsolatedRuntime } from './isolated-install.js';
import { opencliInstallCommand } from './install.js';
import { hostSurface } from './platform.js';
import { createPreflight } from './preflight.js';
import { probeDesktopToolchain } from './toolchain-probe.js';
import { createDesktopBrowser, type DesktopBrowser } from './browser-wake.js';
import { profileDirOf } from '@dsh-workbench/adapter-supply';
import { prependPath, runtimeSeedRootOf } from './runtime-seed.js';
import { localPnpmCommand, provisionLocalPnpm, type LocalPnpmProvision } from './toolchain.js';
import { holdToolchainLock } from './toolchain-lock.js';

function desktopBrowserOf(input: {
  ctx: DshHostContext;
  seam: Seam;
  command: string;
}): DesktopBrowser | undefined {
  const dir = profileDirOf(input.ctx);
  const surface = hostSurface({ profile: dir === null ? undefined : basename(dir) });
  if (!surface.capabilities.browserWake) return undefined;
  return createDesktopBrowser({
    seam: input.seam,
    command: input.command,
    stateFile: join(workbenchRoot(), 'browser.json'),
    ...(input.ctx.logger === undefined ? {} : { logger: input.ctx.logger }),
  });
}

export async function provisionWorkbenchPnpm(input: {
  readonly root: string;
  readonly seam: Seam;
  readonly run?: ((command: string) => Promise<{ ok: boolean; detail: string }>) | undefined;
}): Promise<LocalPnpmProvision> {
  const result = await provisionLocalPnpm({
    root: input.root,
    pnpm: process.env.DSH_WB_PNPM?.trim() || 'pnpm',
    npm: 'npm',
    run:
      input.run ??
      ((command) =>
        runBootstrapCommand(command, {
          timeoutMs: PREFLIGHT_INSTALL_TIMEOUT_MS,
          seam: input.seam,
        })),
  });
  if (result.ok && result.binDir !== undefined) {
    prependPath(result.binDir);
    process.env.DSH_WB_PNPM = quoteShellArgFor(localPnpmCommand(input.root), process.platform);
  }
  return result;
}

const EXTENSION_ENV = 'DSH_WB_OPENCLI_EXTENSION';

function hasManifest(dir: string): boolean {
  return existsSync(join(dir, 'manifest.json'));
}

function extensionDirOf(bundled: string | undefined): string | undefined {
  const asked = process.env[EXTENSION_ENV]?.trim();
  if (asked !== undefined && asked !== '') return asked;
  const local = join(toolchainDir(), '..', 'extension');
  if (hasManifest(local)) return local;
  return bundled !== undefined && hasManifest(bundled) ? bundled : undefined;
}

function describeToolchain(toolchain: string, pkgDir: string): string {
  if (!existsSync(toolchain)) return `${toolchain} 不存在`;
  const entries = (() => {
    try {
      return readdirSync(toolchain).slice(0, 8).join('、');
    } catch (error) {
      return `读不到（${String(error)}）`;
    }
  })();
  if (!existsSync(pkgDir)) return `${toolchain} 里有 ${entries === '' ? '空' : entries}，没有 @jackwener/opencli`;
  const files = (() => {
    try {
      return readdirSync(pkgDir).slice(0, 8).join('、');
    } catch {
      return '';
    }
  })();
  return `包目录在，内容：${files === '' ? '读不到' : files}`;
}

export function registerPreflight(input: {
  routes: RouteTable;
  ctx: DshHostContext;
  seam: Seam;
  runtimeCommands: Readonly<Record<string, string>>;
  runtimeCapabilities?: RuntimeCapabilities | undefined;
  runtimeCheck?: (() => Promise<{ ok: boolean; detail: string }>) | undefined;
  runtimeLabel?: string | undefined;
  warmReads: () => readonly (readonly string[])[];
  desktopBrowser?: DesktopBrowser | undefined;
  extensionDir?: string | undefined;
}): void {
  const command =
    input.runtimeCommands['opencli'] ?? Object.values(input.runtimeCommands)[0] ?? 'opencli';
  const configuredInstall = process.env.DSH_WORKBENCH_OPENCLI_INSTALL;
  const installCommand =
    configuredInstall === undefined || configuredInstall === ''
      ? opencliInstallCommand()
      : configuredInstall;
  const desktopBrowser =
    input.desktopBrowser ??
    desktopBrowserOf({
      ctx: input.ctx,
      seam: input.seam,
      command,
    });
  const installLogger = input.ctx.logger;
  const installLog =
    installLogger === undefined ? undefined : (message: string) => installLogger.warn?.(message);
  const preflight = createPreflight({
    seam: input.seam,
    command,
    installCommand,
    ...(extensionDirOf(input.extensionDir) === undefined ? {} : { extensionDir: extensionDirOf(input.extensionDir) }),
    installed: () => isOpencliReady(),
    installedNote: () => {
      if (!isOpencliReady()) return undefined;
      const at = opencliBuiltAt(toolchainDir());
      return at === undefined ? undefined : `${at} 装好`;
    },
    versionAttempts: 3,
    withToolchainLock: (run) => holdToolchainLock(toolchainDir(), run).catch(() => run()),
    install: async () => {
      try {
        return await holdToolchainLock(toolchainDir(), async () => {
          if (isOpencliReady()) return { ok: true, detail: '另一个实例已经装好，不再重装' };
          const store = storeDirFor(toolchainDir());
          return installIsolatedRuntime({
            liveDir: toolchainDir(),
            command: (dir) => opencliInstallCommand(undefined, undefined, dir, store),
            run: (line) =>
              runBootstrapCommand(line, {
                timeoutMs: PREFLIGHT_INSTALL_TIMEOUT_MS,
                seam: input.seam,
              }),
            ready: (dir) => isOpencliReadyAt(dir),
            describe: (dir) => describeToolchain(dir, opencliPackageDir(dir)),
            ...(installLog === undefined ? {} : { log: installLog }),
          });
        });
      } catch (error) {
        return { ok: false, detail: `等另一个实例装完时出错：${String(error)}` };
      }
    },
    logger: input.ctx.logger,
    warmReads: input.warmReads,
    ...(input.runtimeCapabilities === undefined ? {} : { capabilities: input.runtimeCapabilities }),
    ...(input.runtimeCheck === undefined ? {} : { runtimeCheck: input.runtimeCheck }),
    ...(input.runtimeLabel === undefined ? {} : { runtimeLabel: input.runtimeLabel }),
    probeDiy: createDiyPresetProbe(input.ctx),
    probeToolchain: () => probeDesktopToolchain(input.seam),
    provisionPnpm: async () => {
      const root = runtimeSeedRootOf(input.ctx);
      if (root === null) return { ok: false, detail: '找不到工作台根' };
      return provisionWorkbenchPnpm({ root, seam: input.seam });
    },
    ...(desktopBrowser === undefined ? {} : { desktopBrowser }),
  });
  input.routes.preflight = preflightHandler(preflight);
  if (desktopBrowser !== undefined) {
    input.routes[WAKE_BROWSER_ROUTE] = async () => {
      const result = await desktopBrowser.wake().catch(() => ({ status: 'unknown' as const }));
      return { ok: true, ...result };
    };
  }
}
