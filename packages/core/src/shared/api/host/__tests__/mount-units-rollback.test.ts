import { describe, expect, it } from 'vitest';
import type { DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared';
import { mountUnits } from '@/kernel/host/mount-units';
import { hostOf, manifest } from './unit-face-helpers';

describe('mountUnits：mount 抛错时撤回已注册工具', () => {
  it('★ scoped ctx 里注册的工具在 mount 抛错后当场撤回，单元记入 failures', () => {
    const registered = new Set<string>();
    const disposed: string[] = [];
    const tools: DshToolRegistry = {
      register(definition) {
        registered.add(definition.name);
        return () => {
          registered.delete(definition.name);
          disposed.push(definition.name);
        };
      },
    };
    const ctx = {
      get: (name: string) => (name === 'tools' ? tools : undefined),
    } as never;
    const host = hostOf(manifest('boom', { inject: [] }), (deps) => {
      deps.ctx.get<DshToolRegistry>('tools')?.register({
        name: 'boom_tool',
        description: '试一下注册期抛错',
        parameters: { type: 'object', properties: {} },
      } as unknown as DshToolDefinition);
      throw new Error('mount 失败');
    });

    const plan = mountUnits([host], { ctx, manifests: () => [] });

    expect(disposed).toEqual(['boom_tool']);
    expect(registered.size).toBe(0);
    expect(plan.mounted).toEqual([]);
    expect(plan.failed.map((one) => one.id)).toEqual(['boom']);
    expect(plan.failed[0]?.reason).toContain('mount 失败');
  });
});
