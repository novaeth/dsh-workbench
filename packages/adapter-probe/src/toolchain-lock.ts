import { mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { now } from '@dsh-workbench/shared/host';
import lockfile from 'proper-lockfile';

export interface ToolchainLockOptions {
  readonly waitMs?: number | undefined;
  readonly staleMs?: number | undefined;
}

const DEFAULT_WAIT_MS = 90_000;
const POLL_MS = 500;

function isLocked(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ELOCKED';
}


async function acquire(
  dir: string,
  stale: number,
  waitMs: number,
): Promise<() => Promise<void>> {
  const deadline = now() + waitMs;
  for (;;) {
    try {
      return await lockfile.lock(dir, {
        realpath: false,
        stale,
        update: Math.max(1_000, Math.floor(stale / 4)),
        retries: 0,
      });
    } catch (error) {
      if (!isLocked(error) || now() >= deadline) throw error;
      await delay(POLL_MS);
    }
  }
}

export async function holdToolchainLock<T>(
  dir: string,
  run: () => Promise<T>,
  options: ToolchainLockOptions = {},
): Promise<T> {
  mkdirSync(dir, { recursive: true });
  const release = await acquire(dir, options.staleMs ?? 120_000, options.waitMs ?? DEFAULT_WAIT_MS);
  try {
    return await run();
  } finally {
    await release();
  }
}
