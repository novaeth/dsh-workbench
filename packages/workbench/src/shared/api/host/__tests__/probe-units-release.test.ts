import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeUnitCommands } from '../probe-units';
import { resetReleaseCache } from '../release';
import { createFakeShell } from '@dsh-workbench/shared/testing';

afterEach(() => {
  vi.unstubAllEnvs();
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
  plugins: [
    {
      name: 'demo',
      commands: ['issues'],
      installSource: { kind: 'npm' as const, package: PKG, registryEnv: ENV },
    },
  ],
};

describe('版本信号（源上有新版）', () => {
  afterEach(() => {
    resetReleaseCache();
  });

  it('命令齐、本地旧、源上新 → 这一份 outdated，修法是"从源上装新版"', async () => {
    vi.stubEnv(ENV, REGISTRY);
    const fake = shellWith('1.0.39', '1.0.40');

    const result = await probeUnitCommands({ shell: fake.shell, unit, force: true });

    expect(result.plugins?.[0]?.status).toBe('outdated');
    expect(result.plugins?.[0]?.release).toEqual({ installed: '1.0.39', latest: '1.0.40' });
    expect(result.fix).toBe('update');
    expect(result.command).toContain('npm i --prefix');
    expect(result.command).toContain('ln -s');
    expect(result.command).not.toContain('plugin install');
    expect(result.detail).toContain('源上有新版');
  });

  it('本地与源一致 → ok，不给「更新」', async () => {
    vi.stubEnv(ENV, REGISTRY);
    const fake = shellWith('1.0.40', '1.0.40');

    const result = await probeUnitCommands({ shell: fake.shell, unit, force: true });

    expect(result.plugins?.[0]?.status).toBe('ok');
    expect(result.fix).toBeUndefined();
    expect(result.detail).not.toContain('源上有新版');
  });

  it('没设源的环境变量 → 只有"我们装的是哪版"，**不谎报"有新版"**', async () => {
    vi.stubEnv(ENV, '');
    const fake = shellWith('1.0.39', '1.0.40');

    const result = await probeUnitCommands({ shell: fake.shell, unit, force: true });

    expect(result.plugins?.[0]?.status).toBe('ok');
    expect(result.plugins?.[0]?.release).toEqual({ installed: '1.0.39' });
    expect(result.fix).toBeUndefined();
  });
});
