import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { workshopPathOf } from './diy';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function ctxWith(home: string | undefined): DshHostContext {
  return {
    get: (name: string) => (name === 'dshHomePath' && home !== undefined ? (rel: string) => join(home, rel) : undefined),
  } as unknown as DshHostContext;
}

describe('workshopPathOf', () => {
  it('有 dshHomePath 就把工坊算在 $DSH_HOME/workbench/diy', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-diy-'));
    roots.push(home);
    expect(workshopPathOf(ctxWith(home))).toBe(join(home, 'workbench', 'diy'));
  });

  it('拿不到工作台目录、或它自己抛，都回 null 而不是把宿主带崩', () => {
    expect(workshopPathOf(ctxWith(undefined))).toBeNull();
    expect(workshopPathOf({ get: () => undefined } as unknown as DshHostContext)).toBeNull();
    const throwing = { get: () => () => { throw new Error('boom'); } } as unknown as DshHostContext;
    expect(workshopPathOf(throwing)).toBeNull();
  });
});
