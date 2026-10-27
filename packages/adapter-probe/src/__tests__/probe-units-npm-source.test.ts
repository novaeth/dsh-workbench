import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeUnits } from '../index.js';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import type { SupplySource } from '@dsh-workbench/shared/host';

afterEach(() => {
  vi.unstubAllEnvs();
});

const pluginsOf = (plugins: Array<{ name: string; commands: string[] }>) => ({
  stdout: JSON.stringify(plugins),
});

async function probeNpmSource(sources: readonly SupplySource[]) {
  const ENV = 'DSH_WB_TEST_NPM_REGISTRY_UNSET';
  vi.stubEnv(ENV, '');
  const fake = createFakeShell([pluginsOf([{ name: 'other', commands: [] }])]);

  const [result] = await probeUnits({
    shell: fake.shell,
    runtimeCommands: { opencli: 'opencli' },
    units: [
      {
        unit: 'issues',
        needs: [{ kind: 'extension', runtime: 'opencli', name: 'demo', commands: ['issues'], purpose: '测试', sources }],
      },
    ],
    force: true,
  });
  return result?.needs.find((need) => need.kind === 'extension' && need.name === 'demo');
}

describe('npm 来源的源地址（环境变量压清单缺省）', () => {
  it('★ 变量没设、清单给了缺省地址 → install: ready，命令里就是那个地址', async () => {
    const OWN = 'https://npm.example.com/module-own';
    const result = await probeNpmSource([
      {
        kind: 'npm',
        package: 'opencli-plugin-demo',
        registryEnv: 'DSH_WB_TEST_NPM_REGISTRY_UNSET',
        registryDefault: OWN,
      },
    ]);

    expect(result?.provision).toBe('ready');
    expect(result?.command).toContain(`--registry '${OWN}'`);
    expect(result?.command).toContain(`NPM_CONFIG_REGISTRY='${OWN}'`);
  });

  it('★ 变量没设、清单也没给缺省地址 → env-missing，不给 fix（界面说"先设它"）', async () => {
    const result = await probeNpmSource([
      { kind: 'npm', package: 'opencli-plugin-demo', registryEnv: 'DSH_WB_TEST_NPM_REGISTRY_UNSET' },
    ]);

    expect(result?.provision).toBe('env-missing');
    expect(result?.command).toBeUndefined();
  });
});
