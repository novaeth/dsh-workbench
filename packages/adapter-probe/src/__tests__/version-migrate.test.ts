import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationReportOf } from '../version-migrate.js';

const PACKAGES = ['@dsh-workbench/core', '@dsh-workbench/module-hello'];

function profileWith(shape: 'real' | 'link' | 'missing'): string {
  const profileDir = mkdtempSync(join(tmpdir(), `dsh-wb-migrate-${shape}-`));
  const elsewhere = join(profileDir, 'versions', '1.2.3-beta.3');
  for (const pkg of PACKAGES) {
    const link = join(profileDir, 'node_modules', pkg);
    mkdirSync(dirname(link), { recursive: true });
    if (shape === 'missing') continue;
    if (shape === 'real') {
      mkdirSync(link, { recursive: true });
      writeFileSync(join(link, 'package.json'), JSON.stringify({ name: pkg, version: '1.2.3-beta.2' }));
    } else {
      mkdirSync(join(elsewhere, 'node_modules', pkg), { recursive: true });
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(join(elsewhere, 'node_modules', pkg), link, 'junction');
    }
  }
  return profileDir;
}

describe('一次性迁移：现在还压在真目录上的那几条', () => {
  it('★ 真目录现场 → 要说清"这一次得先退出"', () => {
    const report = migrationReportOf({ profileDir: profileWith('real'), packages: PACKAGES });
    expect(report.needed).toBe(true);
    expect(report.entries).toEqual(PACKAGES);
  });

  it('★ 迁移过的现场（已经是链接）→ 不再需要退出任何东西', () => {
    expect(migrationReportOf({ profileDir: profileWith('link'), packages: PACKAGES })).toEqual({
      needed: false,
      entries: [],
    });
  });

  it('一条都没有（干净 profile）不算迁移现场', () => {
    expect(migrationReportOf({ profileDir: profileWith('missing'), packages: PACKAGES }).needed).toBe(false);
  });

  it('一半真一半链接：也只认那几条真的', () => {
    const profileDir = profileWith('real');
    const migrated = join(profileDir, 'versions', '1.2.3-beta.3', 'node_modules', PACKAGES[1] as string);
    mkdirSync(migrated, { recursive: true });
    const link = join(profileDir, 'node_modules', PACKAGES[1] as string);
    rmSync(link, { recursive: true, force: true });
    symlinkSync(migrated, link, 'junction');
    const report = migrationReportOf({ profileDir, packages: PACKAGES });
    expect(report.entries).toEqual([PACKAGES[0]]);
  });
});
