import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DshHostContext } from '@dsh-workbench/shared';
import { loadAdapterSet, resolveAdapterSet, type AdapterSet } from '@dsh-workbench/shared/host';
import { createAdapterSet, FIXTURE_MARKER } from '../index.js';

const dirs: string[] = [];
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function profileWithFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-fixture-profile-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture-profile', private: true, type: 'module' }));
  const scope = join(dir, 'node_modules', '@dsh-workbench');
  mkdirSync(scope, { recursive: true });
  symlinkSync(packageRoot, join(scope, 'adapter-fixture'), process.platform === 'win32' ? 'junction' : 'dir');
  return dir;
}

function ctxOf(dir: string): DshHostContext {
  return { get: (key: string) => (key === 'profileContext' ? { dir } : undefined) } as unknown as DshHostContext;
}

function defaults(): AdapterSet {
  const set = createAdapterSet();
  return {
    ...set,
    modules: {} as AdapterSet['modules'],
    runtime: {} as AdapterSet['runtime'],
    plugins: {} as AdapterSet['plugins'],
    actions: {} as AdapterSet['actions'],
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('adapter-fixture：临时 profile 集成', () => {
  it('★★ 从 profile 解析夹具 set，data 用夹具的标记', async () => {
    const loaded = await loadAdapterSet(ctxOf(profileWithFixture()), '@dsh-workbench/adapter-fixture');
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = await loaded.set.data.read({ kind: 'http', url: 'http://fixture.invalid/' });
    expect(result).toEqual({ ok: true, data: FIXTURE_MARKER });
  });

  it('★★ 夹具 set 覆盖默认 data；缺包时回退默认', async () => {
    const fallback = defaults();
    const dir = profileWithFixture();
    const resolved = await resolveAdapterSet(ctxOf(dir), '@dsh-workbench/adapter-fixture', async () => fallback);
    expect(resolved.load.ok).toBe(true);
    expect(await resolved.set.data.read({ kind: 'http', url: 'http://fixture.invalid/' })).toEqual({
      ok: true,
      data: FIXTURE_MARKER,
    });

    const missing = await resolveAdapterSet(ctxOf(dir), '@dsh-workbench/does-not-exist', async () => fallback);
    expect(missing.load).toMatchObject({ ok: false, failure: 'not-resolvable' });
    expect(missing.set).toBe(fallback);
  });

});
