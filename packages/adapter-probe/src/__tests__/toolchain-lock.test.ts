import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { holdToolchainLock } from '../index.js';

function lockDir(): string {
  return join(mkdtempSync(join(tmpdir(), 'toolchain-lock-')), 'toolchain');
}

describe('holdToolchainLock', () => {
  it('两个持锁者串行，不交叠', async () => {
    const dir = lockDir();
    const order: string[] = [];
    let entered: (() => void) | undefined;
    const inside = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = holdToolchainLock(dir, async () => {
      order.push('a-in');
      entered?.();
      await delay(50);
      order.push('a-out');
      return 'a';
    });
    await inside;
    const second = holdToolchainLock(dir, async () => {
      order.push('b-in');
      order.push('b-out');
      return 'b';
    });
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b']);
    expect(order).toEqual(['a-in', 'a-out', 'b-in', 'b-out']);
  });

  it('等不到锁就报错，不假装跑过', async () => {
    const dir = lockDir();
    const release: { current: (() => void) | undefined } = { current: undefined };
    const held = holdToolchainLock(
      dir,
      () =>
        new Promise<void>((resolve) => {
          release.current = resolve;
        }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    await expect(holdToolchainLock(dir, async () => '不该跑到', { waitMs: 10 })).rejects.toThrow();
    release.current?.();
    await held;
  });
});
