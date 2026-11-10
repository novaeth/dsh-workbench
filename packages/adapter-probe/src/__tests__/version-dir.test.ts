import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { versionDirOf, versionProjectFiles, writeVersionProject } from '../version-dir.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-version-dir-'));
const VERSION = '1.2.3-beta.3';

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

const PROFILE_WORKSPACE = [
  'packages:',
  '  - .',
  '',
  'nodeLinker: hoisted',
  'autoInstallPeers: false',
  'minimumReleaseAgeExclude:',
  "  - '@dsh-workbench/core@1.1.10 || 1.2.3-beta.2'",
  "  - '@dsh-workbench/shared@1.1.10'",
  'registry: https://registry.npmjs.org/',
  '',
].join('\n');

function profileWith(workspace?: string, npmrc?: string): string {
  const dir = mkdtempSync(join(ROOT, 'profile-'));
  if (workspace !== undefined) writeFileSync(join(dir, 'pnpm-workspace.yaml'), workspace, 'utf8');
  if (npmrc !== undefined) writeFileSync(join(dir, '.npmrc'), npmrc, 'utf8');
  return dir;
}

function projectAt(profileDir: string, packages?: readonly string[]) {
  return versionProjectFiles({
    profileDir,
    versionsDir: join(ROOT, 'versions'),
    version: VERSION,
    ...(packages === undefined ? {} : { packages }),
  });
}

function lineFor(workspace: string, pkg: string): string | undefined {
  return workspace.split('\n').find((line) => line.includes(`'${pkg}@`) || line.includes(`- '${pkg}@`));
}

describe('版本目录：项目文件从 profile 搬过来', () => {
  it('已有那条发布龄白名单补上目标版本，原来的版本一个不丢', () => {
    const project = projectAt(profileWith(PROFILE_WORKSPACE));
    const line = lineFor(project.workspace, '@dsh-workbench/core');
    expect(line).toContain('1.1.10');
    expect(line).toContain('1.2.3-beta.2');
    expect(line?.endsWith(`|| ${VERSION}'`)).toBe(true);
  });

  it('目标版本已经在名单里就不重复追加', () => {
    const workspace = PROFILE_WORKSPACE.replace('1.2.3-beta.2', VERSION);
    const project = projectAt(profileWith(workspace));
    const line = lineFor(project.workspace, '@dsh-workbench/core');
    expect(line?.split(VERSION).length).toBe(2);
  });

  it('名单里没有的包补进 minimumReleaseAgeExclude 块，且不越出这一块', () => {
    const project = projectAt(profileWith(PROFILE_WORKSPACE), ['@dsh-workbench/core', '@dsh-workbench/adapter-supply']);
    const lines = project.workspace.split('\n');
    const added = lines.findIndex((line) => line.includes("'@dsh-workbench/adapter-supply@"));
    expect(added).toBeGreaterThan(lines.findIndex((line) => line.startsWith('minimumReleaseAgeExclude:')));
    expect(added).toBeLessThan(lines.findIndex((line) => line.startsWith('registry:')));
  });

  it('profile 没有 pnpm-workspace.yaml：回落到 hoisted 布局，并补出整块名单', () => {
    const project = projectAt(profileWith(undefined), ['@dsh-workbench/core']);
    expect(project.workspace).toContain('nodeLinker: hoisted');
    expect(project.workspace).toContain(`  - '@dsh-workbench/core@${VERSION}'`);
  });

  it('manifest：每个包都钉到目标版本', () => {
    const project = projectAt(profileWith(PROFILE_WORKSPACE), ['@dsh-workbench/core', '@dsh-workbench/shared']);
    const manifest = JSON.parse(project.manifest) as { name: string; private: boolean; dependencies: Record<string, string> };
    expect(manifest.private).toBe(true);
    expect(manifest.name).toContain(VERSION);
    expect(manifest.dependencies).toEqual({
      '@dsh-workbench/core': VERSION,
      '@dsh-workbench/shared': VERSION,
    });
  });

  it('.npmrc 原样带过来；没有就是 undefined', () => {
    const npmrc = '//registry.example/:_authToken=secret\n';
    expect(projectAt(profileWith(PROFILE_WORKSPACE, npmrc)).npmrc).toBe(npmrc);
    expect(projectAt(profileWith(PROFILE_WORKSPACE)).npmrc).toBeUndefined();
  });

  it('落盘：三个文件都在、内容与返回值一致、重复写幂等', () => {
    const project = projectAt(profileWith(PROFILE_WORKSPACE, '@scope:registry=https://example.test/\n'), ['@dsh-workbench/core']);
    writeVersionProject(project);
    writeVersionProject(project);
    expect(readFileSync(join(project.dir, 'package.json'), 'utf8')).toBe(project.manifest);
    expect(readFileSync(join(project.dir, 'pnpm-workspace.yaml'), 'utf8')).toBe(project.workspace);
    expect(readFileSync(join(project.dir, '.npmrc'), 'utf8')).toBe(project.npmrc);
  });

  it('版本目录是按版本号分家的', () => {
    expect(versionDirOf('/base/versions', VERSION)).toBe(join('/base/versions', VERSION));
    expect(versionDirOf('/base/versions', '1.2.3-beta.2')).not.toBe(versionDirOf('/base/versions', VERSION));
  });
});
