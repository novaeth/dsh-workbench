import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { pruneVersions, referencedVersionsOf } from '../self-update-prune.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-prune-'));

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function versionDirOf(versionsDir: string, version: string): string {
  const dir = join(versionsDir, version, 'node_modules', '@dsh-workbench', 'core');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@dsh-workbench/core', version }), 'utf8');
  return dir;
}

function caseDirs(versions: readonly string[]): {
  versionsDir: string;
  profilesDir: string;
  profileDir: string;
} {
  const home = mkdtempSync(join(ROOT, 'home-'));
  const versionsDir = join(home, 'workbench', 'versions');
  const profilesDir = join(home, 'profiles');
  const profileDir = join(profilesDir, 'desktop');
  mkdirSync(profileDir, { recursive: true });
  for (const version of versions) versionDirOf(versionsDir, version);
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify({ name: 'desktop', private: true })}\n`, 'utf8');
  return { versionsDir, profilesDir, profileDir };
}

describe('自更新收尾：旧版本目录按引用与保留名单回收', () => {
  it('★ 没被任何 profile 引用的删掉；keep 里的和链接指着的留下', () => {
    const { versionsDir, profilesDir, profileDir } = caseDirs(['1.0.0', '1.1.0', '1.2.0']);
    const link = join(profileDir, 'node_modules', '@dsh-workbench', 'core');
    mkdirSync(join(profileDir, 'node_modules', '@dsh-workbench'), { recursive: true });
    symlinkSync(join(versionsDir, '1.1.0', 'node_modules', '@dsh-workbench', 'core'), link, 'dir');

    const result = pruneVersions({ versionsDir, profilesDir, keep: ['1.2.0'] });

    expect(result.removed).toEqual(['1.0.0']);
    expect(result.kept.sort()).toEqual(['1.1.0', '1.2.0']);
    expect(existsSync(join(versionsDir, '1.0.0'))).toBe(false);
    expect(existsSync(join(versionsDir, '1.1.0'))).toBe(true);
    expect(existsSync(join(versionsDir, '1.2.0'))).toBe(true);
  });

  it('★ profile 清单里的 link: 与 lockfile 里出现过的版本都不动', () => {
    const { versionsDir, profilesDir, profileDir } = caseDirs(['1.0.0', '1.1.0', '1.2.0', '1.3.0']);
    writeFileSync(
      join(profileDir, 'package.json'),
      `${JSON.stringify({
        name: 'desktop',
        private: true,
        dependencies: { '@dsh-workbench/core': 'link:../../workbench/versions/1.0.0/node_modules/@dsh-workbench/core' },
      })}\n`,
      'utf8',
    );
    writeFileSync(
      join(profileDir, 'pnpm-lock.yaml'),
      "      specifier: link:../../workbench/versions/1.1.0/node_modules/@dsh-workbench/core\n",
      'utf8',
    );

    const result = pruneVersions({ versionsDir, profilesDir, keep: ['1.3.0'] });

    expect(result.removed).toEqual(['1.2.0']);
    expect(referencedVersionsOf({ profilesDir, versionsDir })).toEqual(new Set(['1.0.0', '1.1.0']));
  });

  it('别的 profile 指着的版本也不动', () => {
    const { versionsDir, profilesDir } = caseDirs(['1.0.0', '1.2.0']);
    const other = join(profilesDir, 'laptop');
    mkdirSync(join(other, 'node_modules', '@dsh-workbench'), { recursive: true });
    symlinkSync(join(versionsDir, '1.0.0', 'node_modules', '@dsh-workbench', 'core'), join(other, 'node_modules', '@dsh-workbench', 'core'), 'dir');

    const result = pruneVersions({ versionsDir, profilesDir, keep: ['1.2.0'] });

    expect(result.removed).toEqual([]);
    expect(existsSync(join(versionsDir, '1.0.0'))).toBe(true);
  });

  it('版本目录不在、profiles 不在：什么都不做也不抛', () => {
    const home = mkdtempSync(join(ROOT, 'empty-'));
    expect(pruneVersions({ versionsDir: join(home, 'versions'), profilesDir: join(home, 'profiles'), keep: [] })).toEqual({
      removed: [],
      kept: [],
      failed: [],
    });
  });

  it('非目录的东西不碰', () => {
    const { versionsDir, profilesDir } = caseDirs(['1.2.0']);
    writeFileSync(join(versionsDir, 'version-log.txt'), 'not a version', 'utf8');
    pruneVersions({ versionsDir, profilesDir, keep: ['1.2.0'] });
    expect(existsSync(join(versionsDir, 'version-log.txt'))).toBe(true);
  });
});
