import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeUnits } from '../probe-units';
import { createFakeShell } from '@dsh-workbench/shared/testing';

afterEach(() => {
  vi.unstubAllEnvs();
});

const pluginsOf = (plugins: Array<{ name: string; commands: string[] }>) => ({
  stdout: JSON.stringify(plugins),
});

async function probeNpmSource(installSource: {
  readonly kind: 'npm';
  readonly package: string;
  readonly registryEnv: string;
  readonly registryDefault?: string;
}) {
  const ENV = installSource.registryEnv;
  vi.stubEnv(ENV, '');
  const fake = createFakeShell([pluginsOf([{ name: 'other', commands: [] }])]);

  const [result] = await probeUnits({
    shell: fake.shell,
    units: [{ unit: 'issues', plugins: [{ name: 'demo', commands: ['issues'], installSource }] }],
    force: true,
  });
  return result;
}

describe('npm 来源的源地址（环境变量压清单缺省）', () => {
  it('★ 变量没设、清单给了缺省地址 → install: ready，命令里就是那个地址', async () => {
    const OWN = 'https://npm.example.com/module-own';
    const result = await probeNpmSource({
      kind: 'npm',
      package: 'opencli-plugin-demo',
      registryEnv: 'DSH_WB_TEST_NPM_REGISTRY_UNSET',
      registryDefault: OWN,
    });

    expect(result?.install).toBe('ready');
    expect(result?.fix).toBe('install');
    expect(result?.command).toContain(`--registry '${OWN}'`);
    expect(result?.command).toContain(`NPM_CONFIG_REGISTRY='${OWN}'`);
  });

  it('★ 变量没设、清单也没给缺省地址 → env-missing，不给 fix（界面说"先设它"）', async () => {
    const result = await probeNpmSource({
      kind: 'npm',
      package: 'opencli-plugin-demo',
      registryEnv: 'DSH_WB_TEST_NPM_REGISTRY_UNSET',
    });

    expect(result?.install).toBe('env-missing');
    expect(result?.fix).toBeUndefined();
  });
});
