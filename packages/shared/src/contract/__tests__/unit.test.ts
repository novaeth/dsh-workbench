import { describe, expect, it } from 'vitest';
import { hasEnvSupply, type UnitManifest } from '../unit.js';

function manifest(env?: UnitManifest['env']): UnitManifest {
  return {
    id: 'issues',
    card: { titleKey: 'issues.mine', order: 10 },
    tools: [],
    host: { inject: [] },
    ...(env === undefined ? {} : { env }),
  };
}

describe('hasEnvSupply（缺来源时那条回退口径，宿主与浏览器共用一份）', () => {
  it('声明了插件或库 → 有供给', () => {
    expect(hasEnvSupply(manifest({ plugins: [{ name: 'demo', commands: ['x'] }] }))).toBe(true);
    expect(
      hasEnvSupply(
        manifest({
          libs: [
            {
              name: 'opencli-workflow',
              registryEnv: 'WB_NPM',
              registryDefault: 'https://registry.example/',
              purpose: '夹具',
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('★ 只有基座命令（无卡片模块那种）不算供给 —— 它不是市场门槛，只是缺来源时的回退', () => {
    expect(hasEnvSupply(manifest({ command: 'delivery' }))).toBe(false);
    expect(hasEnvSupply(manifest({ plugins: [], libs: [] }))).toBe(false);
    expect(hasEnvSupply(manifest())).toBe(false);
  });
});
