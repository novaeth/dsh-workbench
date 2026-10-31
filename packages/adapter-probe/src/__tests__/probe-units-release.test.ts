import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeUnitCommands } from '../index.js';
import { resetReleaseCache } from '../release-port.js';
import { createFakeShell } from '@dsh-workbench/shared/testing';

afterEach(() => {
  vi.unstubAllEnvs();
  resetReleaseCache();
});

const PKG = 'opencli-plugin-demo';
const REGISTRY = 'https://npm.example.com/team/repo';
const ENV = 'DSH_WB_TEST_REGISTRY';

const shellWith = (installed: string, latest: string) =>
  createFakeShell((call) => {
    if (call.command.includes('plugin list')) {
      return { stdout: JSON.stringify([{ name: 'demo', commands: ['issues'] }]) };
    }
    if (call.command.includes('npm ls')) {
      return { stdout: JSON.stringify({ dependencies: { [PKG]: { version: installed } } }) };
    }
    return { stdout: latest };
  });

const unit = {
  unit: 'unit-newer',
  needs: [
    {
      kind: 'extension' as const,
      runtime: 'opencli',
      name: 'demo',
      commands: ['issues'],
      purpose: '测试',
      sources: [{ kind: 'npm' as const, package: PKG, registryEnv: ENV }],
    },
  ],
};

const demoState = (result: Awaited<ReturnType<typeof probeUnitCommands>>) =>
  result.needs.find((need) => need.kind === 'extension' && need.name === 'demo');

describe('版本信号（源上有新版）', () => {
  it('命令齐、本地旧、源上新 → 结论仍是 ok（能用），版本差记在 installed/latest 上并给升级命令', async () => {
    vi.stubEnv(ENV, REGISTRY);
    const fake = shellWith('1.0.39', '1.0.40');

    const result = await probeUnitCommands({
      shell: fake.shell,
      runtimeCommands: { opencli: 'opencli' },
      unit,
      force: true,
    });

    expect(result.status).toBe('outdated');
    const state = demoState(result);
    expect(state?.status).toBe('outdated');
    expect(state?.installed).toBe('1.0.39');
    expect(state?.latest).toBe('1.0.40');
    expect(state?.command).toContain('pnpm add --dir');
    expect(state?.command).toContain('ln -s');
    expect(state?.detail).toContain('源上最新');
  });

  it('本地与源一致 → ok，不给升级命令', async () => {
    vi.stubEnv(ENV, REGISTRY);
    const fake = shellWith('1.0.40', '1.0.40');

    const result = await probeUnitCommands({
      shell: fake.shell,
      runtimeCommands: { opencli: 'opencli' },
      unit,
      force: true,
    });

    expect(demoState(result)?.status).toBe('ok');
    expect(demoState(result)?.command).toBeUndefined();
  });

  it('没设源的环境变量 → 只有"我们装的是哪版"，**不谎报"有新版"**', async () => {
    vi.stubEnv(ENV, '');
    const fake = shellWith('1.0.39', '1.0.40');

    const result = await probeUnitCommands({
      shell: fake.shell,
      runtimeCommands: { opencli: 'opencli' },
      unit,
      force: true,
    });

    expect(demoState(result)?.status).toBe('ok');
    expect(demoState(result)?.installed).toBe('1.0.39');
    expect(demoState(result)?.latest).toBeUndefined();
    expect(demoState(result)?.command).toBeUndefined();
  });
});
