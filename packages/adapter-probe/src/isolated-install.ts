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

function stagingOf(liveDir: string): string {
  return `${liveDir}.staging-${randomUUID().slice(0, 8)}`;
}

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

function swap(liveDir: string, staging: string): void {
  const backup = backupOf(liveDir);
  const hadLive = existsSync(liveDir);
  if (hadLive) renameSync(liveDir, backup);
  try {
    renameSync(staging, liveDir);
  } catch (error) {
    if (hadLive && existsSync(backup) && !existsSync(liveDir)) renameSync(backup, liveDir);
    throw error;
  }
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
  const staging = stagingOf(deps.liveDir);
  mkdirSync(staging, { recursive: true });
  writeTextFile(join(staging, 'package.json'), toolchainManifestOf());
  writeTextFile(join(staging, '.npmrc'), toolchainNpmrcOf());
  try {
    const result = await installWithRetry(
      {
        run: deps.run,
        resolves: () => deps.ready(staging),
        drop: () => removePath(join(staging, 'node_modules')),
        describe: () => deps.describe(staging),
        ...(deps.log === undefined ? {} : { log: deps.log }),
      },
      deps.command(staging),
      {
        what: 'opencli',
        dropLabel: '暂存目录的 node_modules',
        mismatch: '第一遍没装上（下载缓存和已有的 node_modules 对不上）',
        unresolved: '第一遍装完还是读不到',
        settled: '装好了',
        unresolvedAgain: '还是读不到',
        failedAgain: '还是没装上',
      },
    );
    if (!result.ok) return result;
    if (!deps.ready(staging)) {
      return { ...result, ok: false, detail: `${result.detail}；暂存目录就绪复检不过` };
    }
    writeTextFile(
      join(staging, '.ready.json'),
      `${JSON.stringify({ pin: OPENCLI_PIN, at: new Date(now()).toISOString() })}\n`,
    );
    swap(deps.liveDir, staging);
    return result;
  } finally {
    discard(staging);
  }
}
