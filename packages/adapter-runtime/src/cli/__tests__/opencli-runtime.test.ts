import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPENCLI_PIN } from '@dsh-workbench/shared/host';

async function load(dshHome: string, home: string) {
  vi.resetModules();
  vi.stubEnv('DSH_HOME', dshHome);
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  return import('../opencli-runtime.js');
}

const roots: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'wb-opencli-'));
  roots.push(dir);
  return dir;
}

function rootOf(dshHome: string): string {
  return join(dshHome, 'workbench', 'opencli');
}

function recordStore(dshHome: string, project: string, storeDir: string): void {
  const file = join(rootOf(dshHome), project, 'node_modules', '.modules.yaml');
  const manifest = {
    hoistedDependencies: {},
    storeDir,
    virtualStoreDir: 'node_modules/.pnpm',
    packageManager: 'pnpm@10.32.1',
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function storeDirIn(command: string): string {
  return /--store-dir '([^']+)'/.exec(command)?.[1] ?? '';
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('opencli 隔离运行时', () => {
  it('三条路径都从 $DSH_HOME 推（与 wrapper 必须一致）', async () => {
    const runtime = await load('/tmp/dshhome', '/tmp/realhome');
    const root = join('/tmp/dshhome', 'workbench', 'opencli');

    expect(runtime.isolatedRoot()).toBe(root);
    expect(runtime.isolatedHome()).toBe(join(root, 'home'));
    expect(runtime.toolchainDir()).toBe(join(root, 'toolchain'));
  });

  it('DSH_HOME 为空 → 退回 $HOME/.dsh（与 wrapper 的 `${DSH_HOME:-…}` 同义）', async () => {
    const runtime = await load('', '/tmp/realhome');

    expect(runtime.isolatedRoot()).toBe(join('/tmp/realhome', '.dsh', 'workbench', 'opencli'));
  });

  it('★ 安装命令装进**隔离前缀**且钉住版本 —— 不是 npm i -g', async () => {
    const runtime = await load('/tmp/dshhome', '/tmp/realhome');
    const command = runtime.isolatedInstallCommand();

    const root = join('/tmp/dshhome', 'workbench', 'opencli');
    expect(command).toContain(`--dir '${join(root, 'toolchain')}'`);
    expect(command).toContain(`@jackwener/opencli@${OPENCLI_PIN}`);
    expect(command).not.toContain(' -g');
    expect(command).toContain(`--store-dir '${join(root, 'pnpm-store')}'`);
    expect(command).toContain('--allow-build=@jackwener/opencli');
  });

  it('DSH_WORKBENCH_HOME 优先（新 profile 用自己那份隔离运行时）', async () => {
    const runtime = await load('/tmp/dshhome', '/tmp/realhome');
    vi.stubEnv('DSH_WORKBENCH_HOME', '/tmp/dshhome/workbench-2');
    expect(runtime.isolatedRoot()).toBe(join('/tmp/dshhome/workbench-2', 'opencli'));
  });

  it('★ 对外给的入口是**稳定路径**（软链），不依赖本仓库在哪', async () => {
    const runtime = await load('/tmp/dshhome', '/tmp/realhome');

    expect(runtime.isolatedCommand()).toBe(
      join('/tmp/dshhome', 'workbench', 'opencli', 'bin', process.platform === 'win32' ? 'opencli.cmd' : 'opencli'),
    );
  });
});

describe('pnpm 的 store 跟随既有 node_modules（同源的那一个来源）', () => {
  it('★ 事故那一幕：既有 toolchain/node_modules 记 pnpm-store → 两条安装命令都用 pnpm-store', async () => {
    const dshHome = tempHome();
    const store = join(rootOf(dshHome), 'pnpm-store');
    recordStore(dshHome, 'toolchain', store);
    const runtime = await load(dshHome, '/tmp/realhome');

    expect(storeDirIn(runtime.isolatedInstallCommand())).toBe(store);
    expect(storeDirIn(runtime.isolatedPnpmInstallCommand('/opt/pnpm.cjs'))).toBe(store);
  });

  it('★ 既有记的是 npm-cache → 跟着 npm-cache（装好的那份 store 不翻面）', async () => {
    const dshHome = tempHome();
    const store = join(rootOf(dshHome), 'npm-cache');
    recordStore(dshHome, 'toolchain', store);
    const runtime = await load(dshHome, '/tmp/realhome');

    expect(storeDirIn(runtime.isolatedInstallCommand())).toBe(store);
    expect(storeDirIn(runtime.isolatedPnpmInstallCommand('/opt/pnpm.cjs'))).toBe(store);
  });

  it('没有既有 node_modules → 默认 pnpm-store（两条命令一致）', async () => {
    const dshHome = tempHome();
    const runtime = await load(dshHome, '/tmp/realhome');
    const store = join(rootOf(dshHome), 'pnpm-store');

    expect(storeDirIn(runtime.isolatedInstallCommand())).toBe(store);
    expect(storeDirIn(runtime.isolatedPnpmInstallCommand('/opt/pnpm.cjs'))).toBe(store);
  });
});

describe('Desktop 无 npm 时的 pnpm 安装命令', () => {
  it('★ 装进同一个隔离目录、钉住版本，并允许 opencli 的 postinstall', async () => {
    const runtime = await load('/tmp/dshhome', '/tmp/realhome');
    const command = runtime.isolatedPnpmInstallCommand('/Applications/Test.app/Contents/Resources/pnpm.cjs');

    expect(command).toContain('/Applications/Test.app/Contents/Resources/pnpm.cjs');
    const root = join('/tmp/dshhome', 'workbench', 'opencli');
    expect(command).toContain(`add --dir '${join(root, 'toolchain')}'`);
    expect(command).toContain(`@jackwener/opencli@${OPENCLI_PIN}`);
    expect(command).toContain(`--store-dir '${join(root, 'pnpm-store')}'`);
    expect(command).toContain('--allow-build=@jackwener/opencli');
    expect(command).not.toContain('npm i');
  });
});
