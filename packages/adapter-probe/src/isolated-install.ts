import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { toolchainManifestOf, toolchainNpmrcOf } from '@dsh-workbench/adapter-runtime';
import { OPENCLI_PIN, now, removePath, writeTextFile } from '@dsh-workbench/shared/host';
import { installWithRetry, type InstallAttempt, type InstallRetryResult } from './install-retry.js';

export type IsolatedInstallRun = InstallAttempt;

export interface IsolatedInstallDeps {
  readonly liveDir: string;
  readonly command: (dir: string) => string;
  readonly run: (command: string) => Promise<IsolatedInstallRun>;
  readonly ready: (dir: string) => boolean;
  readonly describe: (dir: string) => string;
  readonly log?: ((message: string) => void) | undefined;
}

export type IsolatedInstallResult = InstallRetryResult;

function backupOf(liveDir: string): string {
  return `${liveDir}.prev-${now()}-${randomUUID().slice(0, 4)}`;
}

export function cleanupToolchainSiblings(liveDir: string): void {
  const parent = dirname(liveDir);
  const name = basename(liveDir);
  let entries: readonly string[];
  try {
    entries = readdirSync(parent);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.startsWith(`${name}.staging-`) && !entry.startsWith(`${name}.broken-`)) continue;
    try {
      removePath(join(parent, entry));
    } catch {
      continue;
    }
  }
  const previous = entries.filter((entry) => entry.startsWith(`${name}.prev-`)).sort();
  for (const entry of previous.slice(0, Math.max(0, previous.length - 1))) {
    try {
      removePath(join(parent, entry));
    } catch {
      continue;
    }
  }
}

export function rollbackToolchain(liveDir: string): boolean {
  const parent = dirname(liveDir);
  const name = basename(liveDir);
  let entries: readonly string[];
  try {
    entries = readdirSync(parent);
  } catch {
    return false;
  }
  const newest = entries.filter((entry) => entry.startsWith(`${name}.prev-`)).sort().at(-1);
  if (newest === undefined) return false;
  const broken = `${liveDir}.broken-${now()}`;
  if (existsSync(liveDir)) renameSync(liveDir, broken);
  try {
    renameSync(join(parent, newest), liveDir);
  } catch (error) {
    if (existsSync(broken) && !existsSync(liveDir)) renameSync(broken, liveDir);
    throw error;
  }
  discard(broken);
  return true;
}

function discard(dir: string): void {
  if (!existsSync(dir)) return;
  try {
    removePath(dir);
  } catch {
    return;
  }
}

export async function installIsolatedRuntime(
  deps: IsolatedInstallDeps,
): Promise<IsolatedInstallResult> {
  cleanupToolchainSiblings(deps.liveDir);
  const backup = backupOf(deps.liveDir);
  const hadLive = existsSync(deps.liveDir);
  if (hadLive) renameSync(deps.liveDir, backup);
  mkdirSync(deps.liveDir, { recursive: true });
  writeTextFile(join(deps.liveDir, 'package.json'), toolchainManifestOf());
  writeTextFile(join(deps.liveDir, '.npmrc'), toolchainNpmrcOf());
  const restore = (): void => {
    if (existsSync(deps.liveDir)) discard(deps.liveDir);
    if (hadLive && existsSync(backup)) renameSync(backup, deps.liveDir);
  };
  try {
    const result = await installWithRetry(
      {
        run: deps.run,
        resolves: () => deps.ready(deps.liveDir),
        drop: () => removePath(join(deps.liveDir, 'node_modules')),
        describe: () => deps.describe(deps.liveDir),
        ...(deps.log === undefined ? {} : { log: deps.log }),
      },
      deps.command(deps.liveDir),
      {
        what: 'opencli',
        dropLabel: '装了一半的 node_modules',
        mismatch: '第一遍没装上（下载缓存和已有的 node_modules 对不上）',
        unresolved: '第一遍装完还是读不到',
        settled: '装好了',
        unresolvedAgain: '还是读不到',
        failedAgain: '还是没装上',
      },
    );
    if (!result.ok) {
      restore();
      return result;
    }
    if (!deps.ready(deps.liveDir)) {
      restore();
      return { ...result, ok: false, detail: `${result.detail}；装完复检不过` };
    }
    writeTextFile(
      join(deps.liveDir, '.ready.json'),
      `${JSON.stringify({ pin: OPENCLI_PIN, at: new Date(now()).toISOString() })}\n`,
    );
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}
