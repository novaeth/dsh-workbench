import { describe, expect, it } from 'vitest';
import type { DshHostContext, UnitManifest } from '@dsh-workbench/shared';
import type { UnitModuleFace } from '@dsh-workbench/shared/host';
import { mountUnits } from '../mount-units';
import type { HostUnit } from '../unit-registry';

const manifest: UnitManifest = { id: 'probe', card: null, tools: [], host: { inject: [] } };

const adapters = { marker: 'adapters' };

describe('mountUnits：交给套件的 ctx 转发 get 的 strict', () => {
  it('提供者纤维还没 active 时，mount 里也能按非严格读到适配器', () => {
    let seen: unknown;
    const face: UnitModuleFace = {
      unit: 'probe',
      mount: (deps) => {
        seen = deps.ctx.get('workbenchAdapters', false);
        return { routes: {}, registerTools: () => [] };
      },
    };
    const host: HostUnit = { unit: 'probe', manifest, face, source: { kind: 'owned' } };
    const ctx = {
      get: (name: string, strict?: boolean) => {
        if (name === 'tools') return { register: () => () => {} };
        if (name === 'workbenchAdapters' && strict === false) return adapters;
        return undefined;
      },
      logger: { warn: () => {} },
    } as unknown as DshHostContext;

    const plan = mountUnits([host], { ctx, manifests: () => [manifest] });

    expect(seen).toBe(adapters);
    expect(plan.failed).toEqual([]);
    expect(plan.mounted).toHaveLength(1);
  });
});
