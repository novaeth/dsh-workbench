import { basename, join } from 'node:path';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import type { RouteTable } from '@dsh-workbench/shared/host';
import { INSTALL_TIMEOUT_MS, preflightHandler, runShell, tailLines, workbenchRoot } from '@dsh-workbench/shared/host';
import { WAKE_BROWSER_ROUTE } from '@dsh-workbench/shared/contract/protocol/preflight-wake';
import { createDiyPresetProbe } from './diy-preset-health.js';
import { hostSurface } from './platform.js';
import { createPreflight, probeDesktopToolchain } from './preflight.js';
import { createDesktopBrowser, type DesktopBrowser } from './browser-wake.js';
import { profileDirOf } from '@dsh-workbench/adapter-supply';
import { prependPath, runtimeSeedRootOf } from './runtime-seed.js';
import { localNpmCache, provisionLocalNpm, provisionLocalPnpm } from './toolchain.js';

function desktopBrowserOf(input: {
  ctx: DshHostContext;
  shell: DshShell;
  command: string;
}): DesktopBrowser | undefined {
  const dir = profileDirOf(input.ctx);
  const surface = hostSurface({ profile: dir === null ? undefined : basename(dir) });
  if (!surface.capabilities.browserWake) return undefined;
  return createDesktopBrowser({
    shell: input.shell,
    command: input.command,
    stateFile: join(workbenchRoot(), 'browser.json'),
    ...(input.ctx.logger === undefined ? {} : { logger: input.ctx.logger }),
  });
}

export function registerPreflight(input: {
  routes: RouteTable;
  ctx: DshHostContext;
  shell: DshShell;
  opencliCommand: string;
  installCommand?: string | undefined;
  warmReads: () => readonly (readonly string[])[];
  desktopBrowser?: DesktopBrowser | undefined;
}): void {
  const desktopBrowser =
    input.desktopBrowser ??
    desktopBrowserOf({
      ctx: input.ctx,
      shell: input.shell,
      command: input.opencliCommand,
    });
  const profileDir = profileDirOf(input.ctx);
  const surface = hostSurface({ profile: profileDir === null ? undefined : basename(profileDir) });
  const preflight = createPreflight({
    shell: input.shell,
    command: input.opencliCommand,
    ...(input.installCommand === undefined ? {} : { installCommand: input.installCommand }),
    logger: input.ctx.logger,
    warmReads: input.warmReads,
    probeDiy: createDiyPresetProbe(input.ctx),
    ...(surface.deployment === 'desktop'
      ? {
          probeToolchain: () => probeDesktopToolchain(input.shell),
          provisionNpm: async () => {
            const root = runtimeSeedRootOf(input.ctx);
            if (root === null) return { ok: false, detail: '找不到工作台根' };
            const result = await provisionLocalNpm({
              root,
              run: async (command) => {
                const ran = await runShell(input.shell, command, { timeoutMs: INSTALL_TIMEOUT_MS });
                return {
                  ok: ran.exitCode === 0 && !ran.timedOut,
                  detail: tailLines(ran.stderr || ran.stdout, 3),
                };
              },
            });
            if (result.ok && result.binDir !== undefined) {
              prependPath(result.binDir);
              if (process.env.npm_config_cache === undefined) {
                process.env.npm_config_cache = localNpmCache(root);
              }
            }
            return result;
          },
          provisionPnpm: async () => {
            const root = runtimeSeedRootOf(input.ctx);
            if (root === null) return { ok: false, detail: '找不到工作台根' };
            const result = await provisionLocalPnpm({
              root,
              run: async (command) => {
                const ran = await runShell(input.shell, command, { timeoutMs: INSTALL_TIMEOUT_MS });
                return {
                  ok: ran.exitCode === 0 && !ran.timedOut,
                  detail: tailLines(ran.stderr || ran.stdout, 3),
                };
              },
            });
            if (result.ok && result.binDir !== undefined) prependPath(result.binDir);
            return result;
          },
        }
      : {}),
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
