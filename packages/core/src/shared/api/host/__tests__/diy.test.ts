import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { workshopPathOf } from '../diy';

const roots: string[] = [];
const previous = process.env.DSH_WORKBENCH_HOME;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
  else process.env.DSH_WORKBENCH_HOME = previous;
});

const ctx = { get: () => undefined } as unknown as DshHostContext;

describe('workshopPathOf', () => {
  it('工坊算在运行时根的 diy/ 下（$DSH_WORKBENCH_HOME，缺省 $DSH_HOME/workbench）', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-diy-'));
    roots.push(home);
    process.env.DSH_WORKBENCH_HOME = join(home, 'workbench');
    expect(workshopPathOf(ctx)).toBe(join(home, 'workbench', 'diy'));
  });

  it('没有运行时根 env 时退回 $DSH_HOME/workbench/diy', () => {
    delete process.env.DSH_WORKBENCH_HOME;
    const previousHome = process.env.DSH_HOME;
    process.env.DSH_HOME = '/tmp/dsh-home';
    try {
      expect(workshopPathOf(ctx)).toBe(join('/tmp/dsh-home', 'workbench', 'diy'));
    } finally {
      if (previousHome === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previousHome;
    }
  });

  it('工作台目录算不出来也不把宿主带崩', () => {
    expect(() => workshopPathOf({ get: () => () => { throw new Error('boom'); } } as unknown as DshHostContext)).not.toThrow();
  });
});
