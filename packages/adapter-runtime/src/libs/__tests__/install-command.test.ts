import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BinNeed, LibNeed } from '@dsh-workbench/shared/host';
import { binInstallCommand, libInstallCommand } from '../../foundation/install.js';

const NEED: LibNeed = {
  kind: 'lib',
  name: 'demo-lib',
  purpose: '测试',
  sources: [{ kind: 'npm', package: 'demo-lib' }],
};

const BIN: BinNeed = {
  kind: 'bin',
  name: 'demo-bin',
  purpose: '测试',
  install: { kind: 'npm', package: 'demo-bin' },
};

const roots: string[] = [];

function withHome(record?: { readonly project: string; readonly storeDir: string }): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-libs-'));
  roots.push(dir);
  vi.stubEnv('DSH_HOME', dir);
  if (record !== undefined) {
    const file = join(dir, 'workbench', 'opencli', record.project, 'node_modules', '.modules.yaml');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `storeDir: ${record.storeDir}\n`, 'utf8');
  }
  return join(dir, 'workbench', 'opencli', 'libs');
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('共用依赖的安装命令（libs 前缀 + 同一个 store 来源）', () => {
  it('★ 没有既有 node_modules → 装到 libs，store 就是默认的 pnpm-store', () => {
    const libs = withHome();
    const command = libInstallCommand({ need: NEED, source: { kind: 'npm', package: 'demo-lib' } });

    expect(command).toContain(`add --dir '${libs}'`);
    expect(command).toContain("'demo-lib@latest'");
    expect(command).toContain(`--store-dir '${join(dirname(libs), 'pnpm-store')}'`);
    expect(command).toContain("--allow-build='demo-lib'");
  });

  it('★ 既有 libs/node_modules 记 pnpm-store → 还是 pnpm-store（事故那一幕）', () => {
    const libs = withHome({ project: 'libs', storeDir: join(tmpdir(), 'shared-store') });
    const command = libInstallCommand({ need: NEED, source: { kind: 'npm', package: 'demo-lib' } });

    expect(command).toContain(`--store-dir '${join(tmpdir(), 'shared-store')}'`);
    expect(libs.endsWith(join('opencli', 'libs'))).toBe(true);
  });

  it('★ 既有 libs/node_modules 记 npm-cache → 跟着 npm-cache（不翻面）', () => {
    const libs = withHome();
    const store = join(dirname(libs), 'npm-cache');
    const file = join(libs, 'node_modules', '.modules.yaml');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `storeDir: ${store}\n`, 'utf8');

    expect(libInstallCommand({ need: NEED, source: { kind: 'npm', package: 'demo-lib' } })).toContain(
      `--store-dir '${store}'`,
    );
  });

  it('bin 那条走同一个 store（与 lib 同源）', () => {
    const libs = withHome();
    const store = join(dirname(libs), 'npm-cache');
    const file = join(libs, 'node_modules', '.modules.yaml');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `storeDir: "${store}"\n`, 'utf8');

    const command = binInstallCommand(BIN, 'darwin', {});

    expect(command).toContain(`--store-dir '${store}'`);
    expect(command).toContain("'demo-bin@latest'");
  });
});
