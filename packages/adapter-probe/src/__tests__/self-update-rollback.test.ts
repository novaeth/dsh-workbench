import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SELF_UPDATE_PACKAGES, selfUpdatePaths } from '../self-update-plan.js';
import { rollbackSelfUpdate } from '../self-update-rollback.js';
import { versionDirOf } from '../version-dir.js';

const CORE = '@dsh-workbench/core';
const OLD = '1.2.3-beta.2';
const NEW = '1.2.3-beta.3';
const AT = '2026-11-10T12:00:00.000Z';

let home = '';

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-wb-rollback-'));
  vi.stubEnv('DSH_WORKBENCH_HOME', home);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function homeWith(input: { readonly marker?: boolean; readonly previous?: boolean }): string {
  const paths = selfUpdatePaths();
  mkdirSync(paths.dir, { recursive: true });
  if (input.marker !== false) {
    writeFileSync(
      paths.marker,
      JSON.stringify({ state: 'pending-restart', profile: 'workbench', pkg: CORE, from: OLD, to: NEW, pinned: true, version: NEW, at: AT }),
    );
  }
  if (input.previous !== false) {
    const dir = versionDirOf(paths.versionsDir, OLD);
    for (const pkg of SELF_UPDATE_PACKAGES) {
      mkdirSync(join(dir, 'node_modules', pkg), { recursive: true });
      writeFileSync(
        join(dir, 'node_modules', pkg, 'package.json'),
        JSON.stringify({ name: pkg, version: OLD, exports: { '.': './index.js', './client': './client.js', './host': './host.js' } }),
      );
      for (const artifact of ['client.js', 'dist/client/index.js', 'dist/host/index.js']) {
        mkdirSync(dirname(join(dir, 'node_modules', pkg, artifact)), { recursive: true });
        writeFileSync(join(dir, 'node_modules', pkg, artifact), 'export const artifact = 1;\n');
      }
    }
  }
  return home;
}

describe('切回上一版：不联网、不重装，只把链翻回去', () => {
  it('★ 上一版还在 → 翻回去、marker 落 rolled-back，deps 也跟着回', () => {
    const home = homeWith({});
    const paths = selfUpdatePaths();
    const profileDir = join(home, 'profiles', 'workbench');
    mkdirSync(join(profileDir, 'node_modules', '@dsh-workbench'), { recursive: true });
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'workbench', dependencies: { [CORE]: NEW } }));

    const result = rollbackSelfUpdate({ dshHome: home, profile: 'workbench', version: OLD }, AT);

    expect(result).toEqual({ ok: true, version: OLD });
    const link = join(profileDir, 'node_modules', CORE);
    expect(existsSync(link)).toBe(true);
    expect(realpathSync(link)).toBe(realpathSync(join(paths.versionsDir, OLD, 'node_modules', CORE)));
    expect(JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')).dependencies[CORE]).toContain(
      join('versions', OLD),
    );
    expect(JSON.parse(readFileSync(paths.marker, 'utf8'))).toMatchObject({
      state: 'rolled-back',
      version: OLD,
      from: OLD,
      to: NEW,
    });
  });

  it('★ 上一版已经被清掉 → 老实说回不去，什么都不动', () => {
    const home = homeWith({ previous: false });
    const paths = selfUpdatePaths();
    const before = readFileSync(paths.marker, 'utf8');

    expect(rollbackSelfUpdate({ dshHome: home, profile: 'workbench', version: OLD }, AT)).toEqual({
      ok: false,
      refusal: 'no-previous',
    });
    expect(readFileSync(paths.marker, 'utf8')).toBe(before);
  });

  it('★ 没有 marker（没更新过）→ 也说清，不去瞎翻', () => {
    const home = homeWith({ marker: false });
    expect(rollbackSelfUpdate({ dshHome: home, profile: 'workbench', version: OLD }, AT)).toEqual({
      ok: false,
      refusal: 'no-marker',
    });
  });
});
