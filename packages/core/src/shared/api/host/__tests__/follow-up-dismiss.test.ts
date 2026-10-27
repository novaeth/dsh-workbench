import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dismissFollowUp, isFollowUpDismissed } from '../follow-up-dismiss';

const roots: string[] = [];

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-follow-up-dismiss-'));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('已忽略的提醒：按 profile 落盘，可重复读', () => {
  it('没点过 → 不忽略', () => {
    expect(isFollowUpDismissed(root(), 'data-root-migration')).toBe(false);
  });

  it('点过 → 忽略；同一个 id 再问还是忽略', () => {
    const dir = root();
    dismissFollowUp(dir, 'data-root-migration');

    expect(isFollowUpDismissed(dir, 'data-root-migration')).toBe(true);
    expect(isFollowUpDismissed(dir, 'data-root-migration')).toBe(true);
  });

  it('只忽略点过的那一条，别的 id 不受影响', () => {
    const dir = root();
    dismissFollowUp(dir, 'data-root-migration');
    dismissFollowUp(dir, 'another-follow-up');

    expect(isFollowUpDismissed(dir, 'data-root-migration')).toBe(true);
    expect(isFollowUpDismissed(dir, 'another-follow-up')).toBe(true);
    expect(isFollowUpDismissed(dir, 'not-dismissed')).toBe(false);
  });

  it('文件坏了 → 当作没忽略；再点一次覆盖成可读的', () => {
    const dir = root();
    writeFileSync(join(dir, 'follow-ups.json'), '{ not json', 'utf8');

    expect(isFollowUpDismissed(dir, 'data-root-migration')).toBe(false);
    dismissFollowUp(dir, 'data-root-migration');
    expect(JSON.parse(readFileSync(join(dir, 'follow-ups.json'), 'utf8'))).toMatchObject({
      dismissed: { 'data-root-migration': { at: expect.any(String) } },
    });
  });
});
