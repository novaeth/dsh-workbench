import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  carryPreviousVersion,
  flipProfileLinks,
  installVersionDir,
  isManagedLinkSpec,
  previousVersionLinksOf,
  versionLinksOf,
  versionProjectFiles,
  versionSelfCheck,
  writeProfileLinks,
} from '../version-dir.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-version-switch-'));
const V1 = '1.2.3-beta.2';
const V2 = '1.2.3-beta.3';
const PACKAGES = ['@dsh-workbench/core', '@dsh-workbench/shared'];
const ARTIFACTS = ['client.js', 'dist/client/index.js', 'dist/host/index.js'];

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function caseDir(): string {
  return mkdtempSync(join(ROOT, 'case-'));
}

function writePackage(dir: string, pkg: string, version: string): string {
  const pkgDir = join(dir, 'node_modules', pkg);
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: pkg, version }), 'utf8');
  return pkgDir;
}

function fakeVersionDir(versionsDir: string, version: string): string {
  const dir = join(versionsDir, version);
  for (const pkg of PACKAGES) writePackage(dir, pkg, version);
  for (const artifact of ARTIFACTS) {
    const file = join(dir, 'node_modules', '@dsh-workbench/core', artifact);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, version, 'utf8');
  }
  return dir;
}

function fakeProfile(): string {
  const dir = mkdtempSync(join(ROOT, 'profile-'));
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'dsh-profile-probe',
        private: true,
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@dsh-workbench/core'] } },
        dependencies: {
          '@dsh-workbench/core': V1,
          '@dsh-workbench/shared': V1,
          '@pagoda-dsh-workbench/module-cmdb': '1.1.5',
        },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  return dir;
}

function projectOf(profileDir: string, versionsDir: string, version: string) {
  return versionProjectFiles({ profileDir, versionsDir, version, packages: PACKAGES });
}

describe('版本目录：自检与安装', () => {
  it('自检：七个包与客户端产物齐了才算好；缺一个就不算', () => {
    const versionsDir = join(caseDir(), 'versions');
    const dir = fakeVersionDir(versionsDir, V2);
    expect(versionSelfCheck({ versionDir: dir, version: V2, packages: PACKAGES })).toBe(true);
    expect(versionSelfCheck({ versionDir: dir, version: V1, packages: PACKAGES })).toBe(false);
    rmSync(join(dir, 'node_modules', '@dsh-workbench/shared'), { recursive: true, force: true });
    expect(versionSelfCheck({ versionDir: dir, version: V2, packages: PACKAGES })).toBe(false);
    fakeVersionDir(versionsDir, V2);
    rmSync(join(dir, 'node_modules', '@dsh-workbench/core', 'client.js'));
    expect(versionSelfCheck({ versionDir: dir, version: V2, packages: PACKAGES })).toBe(false);
  });

  it('第一遍就装好：不重装、只跑一遍', async () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const project = projectOf(fakeProfile(), versionsDir, V2);
    const run = async () => {
      fakeVersionDir(versionsDir, V2);
      return { ok: true, detail: '+ 工作台 7 个包' };
    };
    const result = await installVersionDir({ project, version: V2, command: 'pnpm install', deps: { run }, packages: PACKAGES });
    expect(result).toEqual({ ok: true, detail: '+ 工作台 7 个包', reinstalled: false });
    expect(existsSync(join(project.dir, 'pnpm-workspace.yaml'))).toBe(true);
  });

  it('第一遍"成功"但读不到：清掉重装一遍，只清一次', async () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const project = projectOf(fakeProfile(), versionsDir, V2);
    let calls = 0;
    let sawLeftover = false;
    const run = async () => {
      calls += 1;
      if (calls === 1) {
        mkdirSync(join(project.dir, 'node_modules'), { recursive: true });
        writeFileSync(join(project.dir, 'node_modules', 'leftover.txt'), 'first', 'utf8');
        return { ok: true, detail: '第一遍的输出' };
      }
      sawLeftover = existsSync(join(project.dir, 'node_modules', 'leftover.txt'));
      fakeVersionDir(versionsDir, V2);
      return { ok: true, detail: '第二遍的输出' };
    };
    const result = await installVersionDir({ project, version: V2, command: 'pnpm install', deps: { run }, packages: PACKAGES });
    expect(calls).toBe(2);
    expect(sawLeftover).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.reinstalled).toBe(true);
    expect(result.detail).toContain('工作台包 装了两遍');
    expect(result.detail).toContain('清掉 node_modules 重装后装好了');
    expect(result.detail).toContain('第一遍的输出');
    expect(result.detail).toContain('第二遍的输出');
  });

  it('两遍都撞 store 对不上：如实说没装上，且不再跑第三遍', async () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const project = projectOf(fakeProfile(), versionsDir, V2);
    let calls = 0;
    const run = async () => {
      calls += 1;
      return { ok: false, detail: calls === 1 ? 'ERR_PNPM_UNEXPECTED_STORE  expected /a, got /b' : 'ERR_PNPM_UNEXPECTED_STORE  still wrong' };
    };
    const result = await installVersionDir({ project, version: V2, command: 'pnpm install', deps: { run }, packages: PACKAGES });
    expect(calls).toBe(2);
    expect(result.ok).toBe(false);
    expect(result.reinstalled).toBe(true);
    expect(result.detail).toContain('还是没装上');
    expect(result.detail).toContain('still wrong');
  });

  it('第一遍就失败但不是 store 对不上：原样返回，不重装', async () => {
    const base = caseDir();
    const versionsDir = join(base, 'versions');
    const project = projectOf(fakeProfile(), versionsDir, V2);
    let calls = 0;
    const run = async () => {
      calls += 1;
      return { ok: false, detail: 'ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@dsh-workbench%2Fcore' };
    };
    const result = await installVersionDir({ project, version: V2, command: 'pnpm install', deps: { run }, packages: PACKAGES });
    expect(calls).toBe(1);
    expect(result).toEqual({
      ok: false,
      detail: 'ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@dsh-workbench%2Fcore',
      reinstalled: false,
    });
  });
});

describe('翻链：只换指针，不碰旧版本目录', () => {
  it('换到新版：node_modules 里是链接，旧版本目录一个字节不动', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    const oldManifests = PACKAGES.map((pkg) => join(versionsDir, V1, 'node_modules', pkg, 'package.json'));
    const before = oldManifests.map((file) => statSync(file).mtimeMs);

    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES }));

    for (const pkg of PACKAGES) {
      const link = join(profileDir, 'node_modules', pkg);
      expect(lstatSync(link).isSymbolicLink()).toBe(true);
      expect(JSON.parse(readFileSync(join(link, 'package.json'), 'utf8'))).toEqual({ name: pkg, version: V2 });
    }
    expect(oldManifests.map((file) => statSync(file).mtimeMs)).toEqual(before);
    expect(JSON.parse(readFileSync(oldManifests[0] ?? '', 'utf8'))).toEqual({ name: '@dsh-workbench/core', version: V1 });
  });

  it('翻回旧版：链接回来，新版本目录也还在', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    fakeVersionDir(versionsDir, V1);
    fakeVersionDir(versionsDir, V2);
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES }));
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V1), packages: PACKAGES }));
    for (const pkg of PACKAGES) {
      const link = join(profileDir, 'node_modules', pkg);
      expect(JSON.parse(readFileSync(join(link, 'package.json'), 'utf8')).version).toBe(V1);
    }
    expect(existsSync(join(versionsDir, V2, 'node_modules', '@dsh-workbench/core', 'client.js'))).toBe(true);
  });

  it('依赖那几行改成 link:，别人的行与 bundles 一个字不动；写两遍幂等', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    const links = versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES });
    writeProfileLinks({ profileDir, links });
    const first = readFileSync(join(profileDir, 'package.json'), 'utf8');
    writeProfileLinks({ profileDir, links });
    expect(readFileSync(join(profileDir, 'package.json'), 'utf8')).toBe(first);

    const manifest = JSON.parse(first) as {
      dependencies: Record<string, string>;
      dsh: { profile: { bundles: readonly string[] } };
    };
    for (const link of links) {
      expect(manifest.dependencies[link.pkg]).toBe(link.spec);
      expect(link.spec.startsWith('link:')).toBe(true);
      expect(isManagedLinkSpec(link.spec, versionsDir, profileDir)).toBe(true);
    }
    expect(manifest.dependencies['@pagoda-dsh-workbench/module-cmdb']).toBe('1.1.5');
    expect(manifest.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@deepseek-ai/dsh-web-app',
      '@dsh-workbench/core',
    ]);
  });

  it('只认自己管的版本目录：指向仓库的开发副本被拒', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    const managed = versionLinksOf({ profileDir, versionDir: join(versionsDir, V2), packages: PACKAGES })[0];
    expect(isManagedLinkSpec(managed?.spec ?? '', versionsDir, profileDir)).toBe(true);
    expect(isManagedLinkSpec('link:../../../../项目/个人项目/dsh-workbench/packages/core', versionsDir, profileDir)).toBe(false);
    expect(isManagedLinkSpec(`link:${['..', 'elsewhere', 'core'].join('/')}`, versionsDir, profileDir)).toBe(false);
    expect(isManagedLinkSpec(V2, versionsDir, profileDir)).toBe(false);
  });
});

describe('迁移现场：真目录先搬进版本目录，回退才翻得回去', () => {
  const V0 = '1.2.3-beta.1';

  it('真目录搬进版本目录；已经是链接的那条不动', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    const older = join(versionsDir, V0, 'node_modules', PACKAGES[1] as string);
    mkdirSync(older, { recursive: true });
    writeFileSync(join(older, 'package.json'), JSON.stringify({ name: PACKAGES[1], version: V0 }), 'utf8');
    writePackage(profileDir, PACKAGES[0] as string, V1);
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V0), packages: [PACKAGES[1] as string] }));

    const moved = carryPreviousVersion({ profileDir, versionsDir, version: V0, packages: PACKAGES });

    expect(moved).toEqual([PACKAGES[0]]);
    const kept = join(versionsDir, V0, 'node_modules', PACKAGES[0] as string, 'package.json');
    expect(JSON.parse(readFileSync(kept, 'utf8')).version).toBe(V1);
    expect(existsSync(join(profileDir, 'node_modules', PACKAGES[0] as string))).toBe(false);
    expect(lstatSync(join(profileDir, 'node_modules', PACKAGES[1] as string)).isSymbolicLink()).toBe(true);
    expect(existsSync(join(versionsDir, V0, 'package.json'))).toBe(true);
  });

  it('回退那七条按现场算：真目录落进版本目录，已有的链接回自己那条', () => {
    const profileDir = fakeProfile();
    const versionsDir = join(caseDir(), 'versions');
    const older = join(versionsDir, V0, 'node_modules', PACKAGES[1] as string);
    mkdirSync(older, { recursive: true });
    writeFileSync(join(older, 'package.json'), JSON.stringify({ name: PACKAGES[1], version: V0 }), 'utf8');
    writePackage(profileDir, PACKAGES[0] as string, V1);
    flipProfileLinks(versionLinksOf({ profileDir, versionDir: join(versionsDir, V0), packages: [PACKAGES[1] as string] }));
    carryPreviousVersion({ profileDir, versionsDir, version: V0, packages: PACKAGES });

    const links = previousVersionLinksOf({ profileDir, versionsDir, version: V0, packages: PACKAGES });

    expect(links.map((link) => link.target)).toEqual([
      join(versionsDir, V0, 'node_modules', PACKAGES[0] as string),
      join(versionsDir, V0, 'node_modules', PACKAGES[1] as string),
    ]);
    for (const link of links) expect(existsSync(link.target)).toBe(true);
  });
});
