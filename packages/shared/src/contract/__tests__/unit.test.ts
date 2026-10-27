import { describe, expect, it } from 'vitest';
import type { Need } from '../needs.js';
import { needsOf, provisionableNeedsOf, type UnitManifest } from '../unit.js';

function manifest(needs?: readonly Need[]): UnitManifest {
  return {
    id: 'issues',
    titleKey: 'issues.mine', card: { order: 10 },
    tools: [],
    host: { inject: [] },
    ...(needs === undefined ? {} : { needs }),
  };
}

const npm = { kind: 'npm' as const, registryEnv: 'WB_NPM', registryDefault: 'https://registry.example/' };

describe('provisionableNeedsOf（缺来源时那条回退口径，宿主与浏览器共用一份）', () => {
  it('写了 sources 的 extension / lib → 宿主可代装', () => {
    const needs: Need[] = [
      { kind: 'extension', runtime: 'opencli', name: 'demo', purpose: '测试', sources: [npm] },
      { kind: 'lib', name: 'opencli-workflow', purpose: '测试', sources: [npm] },
    ];
    expect(provisionableNeedsOf(manifest(needs)).map((need) => need.name)).toEqual([
      'demo',
      'opencli-workflow',
    ]);
  });

  it('★ 没写 sources 的 extension、bin、env 都不算供给 —— 它们不是市场门槛，只是「我自己装，你帮我判」', () => {
    const needs: Need[] = [
      { kind: 'extension', runtime: 'opencli', name: 'demo', purpose: '测试' },
      { kind: 'bin', name: 'gitops', purpose: '测试' },
      { kind: 'env', name: 'DSH_TOKEN', purpose: '测试' },
    ];
    expect(provisionableNeedsOf(manifest(needs))).toEqual([]);
    expect(provisionableNeedsOf(manifest([]))).toEqual([]);
    expect(provisionableNeedsOf(manifest())).toEqual([]);
  });

  it('needsOf 没写就是空表', () => {
    expect(needsOf(manifest())).toEqual([]);
  });
});
