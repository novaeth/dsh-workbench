import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { SelfUpdatePaths, SelfUpdateRequest } from '@dsh-workbench/shared/host';
import { desktopPnpmEntry, selfUpdateCliFor, type SelfUpdateProcess } from './self-update-cli.js';
import {
  recoveryCommand,
  SELF_UPDATE_PACKAGES,
  selfUpdateBootFile,
  selfUpdateMarker,
  selfUpdateUpFile,
  type SelfUpdateMarker,
} from './self-update-plan.js';
import { migrationReportOf } from './version-migrate.js';
import {
  versionDirOf,
  versionLinksOf,
  versionProjectFiles,
  type VersionLink,
  type VersionProject,
} from './version-dir.js';

export interface SelfUpdateVersionStep {
  readonly kind: 'version';
  readonly project: VersionProject;
}

export interface SelfUpdateInstallStep {
  readonly kind: 'install';
  readonly file: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
}

export interface SelfUpdateVerifyStep {
  readonly kind: 'verify';
  readonly versionDir: string;
  readonly version: string;
  readonly packages: readonly string[];
}

export interface SelfUpdateCarry {
  readonly versionsDir: string;
  readonly version: string;
  readonly packages: readonly string[];
}

export interface SelfUpdateSwitchStep {
  readonly kind: 'switch';
  readonly profileDir: string;
  readonly links: readonly VersionLink[];
  readonly carry?: SelfUpdateCarry | undefined;
}

export interface SelfUpdateBundlesStep {
  readonly kind: 'bundles';
  readonly profileDir: string;
  readonly bundle: string;
}

export interface SelfUpdateExpectBootStep {
  readonly kind: 'expect-boot';
  readonly boot: {
    readonly target: string;
    readonly file: string;
    readonly upFile: string;
    readonly windowMs: number;
    readonly pollMs: number;
  };
}

export interface SelfUpdateMarkerStep {
  readonly kind: 'marker';
  readonly state: 'pending-restart';
  readonly version: string;
}

export type SelfUpdateStep =
  | SelfUpdateVersionStep
  | SelfUpdateInstallStep
  | SelfUpdateVerifyStep
  | SelfUpdateSwitchStep
  | SelfUpdateBundlesStep
  | SelfUpdateExpectBootStep
  | SelfUpdateMarkerStep;

export interface SelfUpdateSteps {
  readonly profileDir: string;
  readonly versionsDir: string;
  readonly versionDir: string;
  readonly version: string;
  readonly bundle: string;
  readonly packages: readonly string[];
  readonly migration: boolean;
  readonly rescue: string;
  readonly markerPath: string;
  readonly logPath: string;
  readonly marker: SelfUpdateMarker;
  readonly steps: readonly SelfUpdateStep[];
}

export interface SelfUpdateStepsOptions {
  readonly proc?: SelfUpdateProcess | undefined;
  readonly exists?: ((path: string) => boolean) | undefined;
  readonly at?: string | undefined;
  readonly bootWindowMs?: number | undefined;
  readonly bootPollMs?: number | undefined;
}

export const SELF_UPDATE_BOOT_WINDOW_MS = 900_000;
export const SELF_UPDATE_BOOT_POLL_MS = 3_000;

export function selfUpdateStepsOf(
  request: SelfUpdateRequest,
  paths: SelfUpdatePaths,
  options: SelfUpdateStepsOptions = {},
): SelfUpdateSteps {
  const profileDir = join(request.dshHome, 'profiles', request.profile);
  const version = request.to === '' ? request.from : request.to;
  const packages = SELF_UPDATE_PACKAGES;
  const versionDir = versionDirOf(paths.versionsDir, version);
  const proc = options.proc ?? process;
  const exists = options.exists ?? existsSync;
  const migration = migrationReportOf({ profileDir, packages }).needed;
  return {
    profileDir,
    migration,
    versionsDir: paths.versionsDir,
    versionDir,
    version,
    bundle: request.pkg,
    packages,
    rescue: recoveryCommand({
      profile: request.profile,
      pkg: request.pkg,
      version: request.to === '' ? 'latest' : request.to,
      cli: selfUpdateCliFor(request.profile, proc, exists),
    }),
    markerPath: paths.marker,
    logPath: paths.log,
    marker: selfUpdateMarker(request, 'running', request.from, options.at ?? new Date().toISOString()),
    steps: [
      { kind: 'version', project: versionProjectFiles({ profileDir, versionsDir: paths.versionsDir, version, packages }) },
      installStep(versionDir, options),
      { kind: 'verify', versionDir, version, packages },
      {
        kind: 'switch',
        profileDir,
        links: versionLinksOf({ profileDir, versionDir, packages }),
        ...(migration
          ? {
              carry: {
                versionsDir: paths.versionsDir,
                version: request.from,
                packages,
              },
            }
          : {}),
      },
      { kind: 'bundles', profileDir, bundle: request.pkg },
      { kind: 'marker', state: 'pending-restart', version },
      {
        kind: 'expect-boot',
        boot: {
          target: version,
          file: selfUpdateBootFile(paths.dir),
          upFile: selfUpdateUpFile(paths.dir),
          windowMs: options.bootWindowMs ?? SELF_UPDATE_BOOT_WINDOW_MS,
          pollMs: options.bootPollMs ?? SELF_UPDATE_BOOT_POLL_MS,
        },
      },
    ],
  };
}

function installStep(versionDir: string, options: SelfUpdateStepsOptions): SelfUpdateInstallStep {
  const proc = options.proc ?? process;
  const pnpm = desktopPnpmEntry(proc, options.exists ?? existsSync);
  if (pnpm === undefined) {
    return { kind: 'install', file: 'pnpm', args: ['install', '--dir', versionDir], env: {}, cwd: versionDir };
  }
  return {
    kind: 'install',
    file: proc.execPath,
    args: [pnpm, 'install', '--dir', versionDir],
    env: { ELECTRON_RUN_AS_NODE: '1' },
    cwd: versionDir,
  };
}
