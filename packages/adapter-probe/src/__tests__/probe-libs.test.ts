import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeLibs, resetLibCache } from '../index.js';
import { createFakeShell } from '@dsh-workbench/shared/testing';

let home = '';

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-libs-'));
  vi.stubEnv('DSH_HOME', home);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetLibCache();
  fs.rmSync(home, { recursive: true, force: true });
});

function installLib(name: string, version: string): void {
  const dir = path.join(home, 'workbench', 'opencli', 'libs', 'node_modules', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version }));
}

const NPM_SOURCE = {
  kind: 'npm',
  registryEnv: 'DSH_WORKBENCH_TEST_REGISTRY',
  registryDefault: 'https://registry.invalid/internal/',
} as const;

const NEED = {
  kind: 'lib',
  name: 'opencli-workflow',
  version: '1.1.23',
  purpose: '发布编排',
  sources: [NPM_SOURCE],
} as const;

const RANGE = { ...NEED, version: '^1.1.20' } as const;

function fakeShell(latest: string | undefined) {
  return createFakeShell(latest === undefined ? [] : [{ stdout: `${latest}\n` }]);
}

describe('probeLibs：交叉依赖（env.libs）', () => {
  it('★ 库没装 → need missing + 一条能照做的安装命令（源用清单里的缺省地址）', async () => {
    const fake = fakeShell(undefined);
    const state = (await probeLibs({ needs: [NEED], shell: fake.shell, force: true })).get('opencli-workflow');

    expect(state).toMatchObject({ name: 'opencli-workflow', status: 'missing' });
    expect(state?.command).toContain('opencli-workflow@1.1.23');
    expect(state?.command).toContain(`${path.join('opencli', 'libs')}'`);
    expect(state?.command).toContain('https://registry.invalid/internal/');
  });

  it('库在、源上同版 → 不说有新版（不谎报）', async () => {
    installLib('opencli-workflow', '1.1.23');
    const state = (await probeLibs({ needs: [NEED], shell: fakeShell('1.1.23').shell, force: true })).get('opencli-workflow');

    expect(state).toMatchObject({ status: 'ok', installed: '1.1.23', latest: '1.1.23' });
  });

  it('★ 库在、源上有新版（声明是范围）→ need outdated，版本差记在 installed/latest 上', async () => {
    installLib('opencli-workflow', '1.1.22');
    const state = (await probeLibs({ needs: [RANGE], shell: fakeShell('1.1.23').shell, force: true })).get('opencli-workflow');

    expect(state).toMatchObject({ status: 'outdated', installed: '1.1.22', latest: '1.1.23' });
    expect(state?.command).toContain('opencli-workflow@1.1.23');
  });

  it('★ 库在、但**不满足声明的版本契约** → unsatisfied（共享件只装一份，"在"不等于"我要的那份"）', async () => {
    installLib('opencli-workflow', '1.1.19');
    const state = (await probeLibs({ needs: [RANGE], shell: fakeShell('1.1.23').shell, force: true })).get('opencli-workflow');

    expect(state).toMatchObject({ status: 'unsatisfied', installed: '1.1.19' });
    expect(state?.latest).toBeUndefined();
    expect(state?.command).toContain('opencli-workflow@^1.1.20');
  });

  it('★ 契约写法读不懂 → 当成没满足报出来（不静默放行）', async () => {
    installLib('opencli-workflow', '1.1.22');
    const state = (
      await probeLibs({ needs: [{ ...RANGE, version: '>=nonsense' }], shell: fakeShell('1.1.23').shell, force: true })
    ).get('opencli-workflow');

    expect(state?.status).toBe('unsatisfied');
  });

  it('问不到源（npm 失败）→ 只给"我们装的是哪版"，不给命令、不判旧', async () => {
    installLib('opencli-workflow', '1.1.23');
    const shell = createFakeShell([{ exitCode: 1, stderr: 'no net' }]).shell;
    const state = (await probeLibs({ needs: [NEED], shell, force: true })).get('opencli-workflow');

    expect(state).toMatchObject({ status: 'ok', installed: '1.1.23' });
    expect(state?.latest).toBeUndefined();
  });

  it('★ 同一个包在多个单元里声明 → **只探一次**（一份共享安装）', async () => {
    installLib('opencli-workflow', '1.1.23');
    const states = await probeLibs({ needs: [NEED, { ...NEED, purpose: '另一个单元也要它' }], shell: fakeShell('1.1.23').shell, force: true });

    expect(states.size).toBe(1);
    expect(states.get('opencli-workflow')?.status).toBe('ok');
  });
});
