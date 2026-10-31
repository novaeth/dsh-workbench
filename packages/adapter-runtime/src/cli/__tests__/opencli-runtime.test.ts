import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPENCLI_PIN } from '@dsh-workbench/shared/host';

async function load(dshHome: string, home: string) {
  vi.resetModules();
  vi.stubEnv('DSH_HOME', dshHome);
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  return import('../opencli-runtime.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
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
    expect(command).toContain(`--prefix '${join(root, 'toolchain')}'`);
    expect(command).toContain(`@jackwener/opencli@${OPENCLI_PIN}`);
    expect(command).not.toContain(' -g');
    expect(command).toContain(`--cache '${join(root, 'npm-cache')}'`);
  });

  it('DSH_WORKBENCH_HOME 优先（新 profile 用自己那份隔离运行时）', async () => {
    const runtime = await load('/tmp/dshhome', '/tmp/realhome');
    vi.stubEnv('DSH_WORKBENCH_HOME', '/tmp/dshhome/workbench-2');
    expect(runtime.isolatedRoot()).toBe(join('/tmp/dshhome', 'workbench-2', 'opencli'));
  });

  it('★ 对外给的入口是**稳定路径**（软链），不依赖本仓库在哪', async () => {
    const runtime = await load('/tmp/dshhome', '/tmp/realhome');

    expect(runtime.isolatedCommand()).toBe(
      join('/tmp/dshhome', 'workbench', 'opencli', 'bin', process.platform === 'win32' ? 'opencli.cmd' : 'opencli'),
    );
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
