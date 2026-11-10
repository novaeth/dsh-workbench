import { RELEASE_PACKAGES, workbenchHostLock, workbenchRoot } from '@dsh-workbench/shared/host';
import type { SelfUpdatePaths, SelfUpdateRequest, SelfUpdateStart } from '@dsh-workbench/shared/host';
import { join } from 'node:path';
import type { SeedCommand } from './runtime-seed.js';
import { type SelfUpdateCli, cliCommand, desktopPnpmEntry, isPathDsh, selfUpdateCliFor } from './self-update-cli.js';
import type { SelfUpdateReason, SelfUpdateState } from '@dsh-workbench/shared/contract/protocol/bundle-install';

const PATH_DSH: SelfUpdateCli = { file: 'dsh', args: [], env: {} };

const WORKSHOP_TOOLCHAIN = '@dsh-workbench/module-tools';

export const SELF_UPDATE_PACKAGES = RELEASE_PACKAGES.filter((name) => name !== WORKSHOP_TOOLCHAIN);

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_MS = 3000;
const DEFAULT_WAIT_MS = 600_000;
const DEFAULT_HOLD_MS = 5000;

export const CORE_ARTIFACTS = ['client.js', 'dist/client/index.js', 'dist/host/index.js'] as const;

export type { SelfUpdatePaths, SelfUpdateRequest, SelfUpdateStart };

export interface SelfUpdateMarker extends SelfUpdateRequest {
  readonly state: SelfUpdateState;
  readonly version: string;
  readonly reason?: SelfUpdateReason | undefined;
  readonly at: string;
}

export interface SelfUpdatePlan {
  readonly paths: SelfUpdatePaths;
  readonly script: string;
  readonly marker: SelfUpdateMarker;
  readonly command: SeedCommand;
}

export interface SelfUpdatePrefetch {
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export function selfUpdatePrefetch(
  request: SelfUpdateRequest,
  cli: SelfUpdateCli = selfUpdateCliFor(request.profile),
): SelfUpdatePrefetch | undefined {
  const pnpm = desktopPnpmEntry();
  if (pnpm === undefined) return undefined;
  const target = request.to === '' ? 'latest' : request.to;
  const expose = cli.args.includes('--expose-internals') ? ['--expose-internals'] : [];
  return {
    file: cli.file,
    args: [...expose, pnpm, 'store', 'add', ...SELF_UPDATE_PACKAGES.map((name) => `${name}@${target}`)],
    env: cli.env,
  };
}

export function attemptsOf(request: SelfUpdateRequest): number {
  const asked = request.attempts ?? DEFAULT_ATTEMPTS;
  return Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : DEFAULT_ATTEMPTS;
}

export function retryMsOf(request: SelfUpdateRequest): number {
  const asked = request.retryMs ?? DEFAULT_RETRY_MS;
  return Number.isFinite(asked) && asked >= 0 ? Math.floor(asked) : DEFAULT_RETRY_MS;
}

export interface SelfUpdateTiming {
  readonly waitMs: number;
  readonly holdMs: number;
  readonly pollMs: number;
  readonly hostPid: number;
}

export function selfUpdateTiming(request: SelfUpdateRequest): SelfUpdateTiming {
  const waitMs = waitMsOf(request);
  const holdMs = holdMsOf(request);
  return {
    waitMs,
    holdMs,
    pollMs: Math.max(50, Math.min(1000, holdMs || waitMs || 1000)),
    hostPid:
      request.hostPid !== undefined && Number.isFinite(request.hostPid) ? Math.floor(request.hostPid) : 0,
  };
}

export function waitMsOf(request: SelfUpdateRequest): number {
  const asked = request.waitMs ?? DEFAULT_WAIT_MS;
  return Number.isFinite(asked) && asked >= 0 ? Math.floor(asked) : DEFAULT_WAIT_MS;
}

export function holdMsOf(request: SelfUpdateRequest): number {
  const asked = request.holdMs ?? DEFAULT_HOLD_MS;
  return Number.isFinite(asked) && asked >= 0 ? Math.floor(asked) : DEFAULT_HOLD_MS;
}

export function selfUpdatePaths(_dshHome: string, platform: NodeJS.Platform = process.platform): SelfUpdatePaths {
  const dir = workbenchRoot();
  return {
    dir,
    script: join(dir, platform === 'win32' ? 'self-update.mjs' : 'self-update.sh'),
    marker: join(dir, 'self-update.json'),
    log: join(dir, 'self-update.log'),
    backup: join(dir, 'backup'),
    hostLock: workbenchHostLock(),
  };
}

export function recoveryCommand(input: {
  readonly profile: string;
  readonly pkg: string;
  readonly version: string;
  readonly cli?: SelfUpdateCli | undefined;
}): string {
  const cli = input.cli ?? PATH_DSH;
  const command = isPathDsh(cli) ? 'dsh' : cliCommand(cli);
  return `${command} plugin --profile ${input.profile} add ${input.pkg}@${input.version}`;
}

export function selfUpdateMarker(
  request: SelfUpdateRequest,
  state: SelfUpdateState,
  version: string,
  at: string,
): SelfUpdateMarker {
  return { ...request, state, version, at };
}
