import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dependencyReader } from '../profile-dependencies';

const root = mkdtempSync(path.join(os.tmpdir(), 'wb-profile-deps-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function profileWith(dependencies: unknown): string {
  const dir = mkdtempSync(path.join(root, 'p-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ dependencies }), 'utf8');
  return dir;
}

describe('profile 里那条依赖是怎么写的', () => {
  it('给什么拿什么：git spec 原样、没有就是 undefined', () => {
    const dir = profileWith({ '@t/a': 'git+ssh://git@host/org/repo.git#sha&path:/packages/@t/a' });
    const read = dependencyReader(dir);
    expect(read('@t/a')).toBe('git+ssh://git@host/org/repo.git#sha&path:/packages/@t/a');
    expect(read('@t/nope')).toBeUndefined();
  });

  it('读不动 / 没有 profile 都不抛，只是没有', () => {
    const broken = mkdtempSync(path.join(root, 'broken-'));
    expect(dependencyReader(broken)('@t/a')).toBeUndefined();
    expect(dependencyReader(null)('@t/a')).toBeUndefined();
  });
});
