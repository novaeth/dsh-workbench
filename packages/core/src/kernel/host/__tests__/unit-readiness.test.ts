import { describe, expect, it } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import { unitReadiness } from '../unit-readiness';

function unit(inject: string[], optional?: string[]): UnitManifest {
  return {
    id: 'unit',
    card: null,
    tools: [],
    host: { inject, ...(optional === undefined ? {} : { optional }) },
  };
}

describe('unitReadiness', () => {
  it('服务齐了 → 能挂，什么都不缺', () => {
    const result = unitReadiness(unit(['webServer'], ['tools']), () => ({}));

    expect(result.canMount).toBe(true);
    expect(result.missingHard).toEqual([]);
    expect(result.missingSoft).toEqual([]);
  });

  it('缺硬依赖 → 不挂，并说清缺哪个', () => {
    const result = unitReadiness(unit(['webServer'], ['tools']), (name) => (name === 'webServer' ? undefined : {}));

    expect(result.canMount).toBe(false);
    expect(result.missingHard).toEqual(['webServer']);
  });

  it('缺软依赖 → 能挂，但记下降级', () => {
    const result = unitReadiness(unit(['webServer'], ['tools', 'shell']), (name) => (name === 'shell' ? undefined : {}));

    expect(result.canMount).toBe(true);
    expect(result.missingSoft).toEqual(['shell']);
  });

  it('不声明软依赖 → 不产生降级噪音', () => {
    const result = unitReadiness(unit(['webServer']), () => ({}));

    expect(result.missingSoft).toEqual([]);
  });
});
