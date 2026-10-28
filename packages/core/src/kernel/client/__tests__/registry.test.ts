import { describe, expect, it, vi } from 'vitest';
import type { UnitClientFace, UnitManifest } from '@dsh-workbench/shared';
import { createClientUnitRegistry } from '../registry';

function face(unit: string): UnitClientFace {
  return { unit, card: () => null };
}

function manifest(id: string, order = 10): UnitManifest {
  return {
    id,
    titleKey: `${id}.title`, card: { order },
    tools: [],
    host: { inject: [] },
  };
}

function warnLines(spy: { mock: { calls: readonly (readonly unknown[])[] } }): string {
  return spy.mock.calls.map((call) => String(call[0])).join('\n');
}

describe('createClientUnitRegistry', () => {
  it('注册与注销都通知订阅者，版本号跟着走', () => {
    const registry = createClientUnitRegistry();
    registry.setManifests([manifest('inventory')]);
    const seen: number[] = [];
    registry.subscribe(() => seen.push(registry.version()));

    const off = registry.register(face('inventory'));
    off();

    expect(seen).toEqual([1, 2]);
    expect(registry.all()).toEqual([]);
    expect(registry.manifests()).toEqual([]);
  });

  it('★ 一个订阅者报错不连累别的订阅者，也不让这次注册失败', () => {
    const registry = createClientUnitRegistry();
    const seen: string[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registry.setManifests([manifest('inventory')]);

    registry.subscribe(() => {
      throw new Error('坏掉的订阅者');
    });
    registry.subscribe(() => seen.push('ok'));

    const off = registry.register(face('inventory'));

    expect(seen).toEqual(['ok']);
    expect(registry.manifests().map((item) => item.id)).toEqual(['inventory']);
    expect(warnLines(warn)).toMatch(/坏掉的订阅者/);

    seen.length = 0;
    off();

    expect(seen).toEqual(['ok']);
    expect(registry.all()).toEqual([]);
    warn.mockRestore();
  });

  it('★ 套件 id 撞名当场抛（id 会进持久化配置，不能撞）', () => {
    const registry = createClientUnitRegistry();
    registry.setManifests([manifest('inventory')]);
    registry.register(face('inventory'));

    expect(() => registry.register(face('inventory'))).toThrow(/套件 id 重复：inventory/);
    expect(registry.all()).toHaveLength(1);
  });

  it('注销之后同一个 id 可以再注册（装卸各走一遍）', () => {
    const registry = createClientUnitRegistry();
    registry.setManifests([manifest('inventory')]);
    const off = registry.register(face('inventory'));
    off();

    expect(() => registry.register(face('inventory'))).not.toThrow();
  });

  it('重复注销是安全的（第二次什么都不做，也不多通知一次）', () => {
    const registry = createClientUnitRegistry();
    registry.setManifests([manifest('inventory')]);
    const seen: number[] = [];
    const off = registry.register(face('inventory'));
    registry.subscribe(() => seen.push(registry.version()));
    off();
    off();

    expect(seen).toEqual([2]);
  });

  it('manifests 跟着注册表走，注销后不留缓存', () => {
    const registry = createClientUnitRegistry();
    registry.setManifests([manifest('issues')]);
    const off = registry.register(face('issues'));

    expect(registry.manifests().map((item) => item.id)).toEqual(['issues']);
    off();
    expect(registry.manifests()).toEqual([]);
  });

  it('★ declared 是宿主担保的全部清单：没有浏览器半侧的合成单元（opencli 插件）也在里面', () => {
    const registry = createClientUnitRegistry();
    registry.setManifests([manifest('issues'), manifest('plugin:opencli-plugin-inventory')]);
    registry.register(face('issues'));

    expect(registry.manifests().map((item) => item.id)).toEqual(['issues']);
    expect(registry.declared().map((item) => item.id)).toEqual(['issues', 'plugin:opencli-plugin-inventory']);

    registry.setManifests([]);

    expect(registry.declared()).toEqual([]);
  });

  it('★ 没有卡片的模块（清单 card: null）：面照挂、花名册里有它，但看板上不出现、也不算拒因', () => {
    const registry = createClientUnitRegistry();
    registry.setManifests([{ ...manifest('delivery'), card: null }, manifest('inventory')]);
    const off = registry.register({ unit: 'delivery' });
    registry.register(face('inventory'));

    expect(registry.refusals()).toEqual([]);
    expect(registry.manifests().map((item) => item.id)).toEqual(['delivery', 'inventory']);
    expect(registry.board.all().map((item) => item.id)).toEqual(['inventory']);

    off();
    expect(registry.manifests().map((item) => item.id)).toEqual(['inventory']);
  });

  it('★ 清单按 unit 从宿主那一份解析：注册早于清单到达，清单到了当场挂上', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = createClientUnitRegistry();

    const off = registry.register(face('issues'));

    expect(registry.manifests()).toEqual([]);
    expect(registry.refusals().map((item) => item.unit)).toEqual(['issues']);
    expect(registry.refusals()[0]?.kind).toBe('no-manifest');

    registry.setManifests([manifest('issues', 7)]);

    expect(registry.manifests().map((item) => item.id)).toEqual(['issues']);
    expect(registry.refusals()).toEqual([]);
    expect(registry.board.byId('issues')?.order).toBe(7);

    off();
    warn.mockRestore();
  });

  it('★ 宿主没说哪些来自已装包（旧宿主）→ null，不许兜成"花名册里全部都是"', () => {
    const registry = createClientUnitRegistry();

    expect(registry.installable()).toBeNull();

    registry.setManifests([manifest('panels'), manifest('issues')]);

    expect(registry.installable()).toBeNull();
  });

  it('★ 宿主说了 → 逐字就是那一份；说过之后再喂清单也还是那一份', () => {
    const registry = createClientUnitRegistry();

    registry.setManifests([manifest('panels'), manifest('issues')], ['issues']);

    expect([...(registry.installable() ?? [])]).toEqual(['issues']);

    registry.setManifests([manifest('panels'), manifest('issues'), manifest('inventory')], ['issues', 'inventory']);

    expect([...(registry.installable() ?? [])]).toEqual(['issues', 'inventory']);
  });

  it('★ 宿主没担保的 unit 不静默：点名说清、不进名单、记下拒因、问一次宿主', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const asked: string[] = [];
    const registry = createClientUnitRegistry({ onUnknownUnit: (unit) => asked.push(unit) });

    registry.register(face('ghost'));

    expect(warnLines(warn)).toMatch(/ghost/);
    expect(registry.refusals()).toHaveLength(1);
    expect(registry.refusals()[0]?.unit).toBe('ghost');
    expect(String(registry.refusals()[0]?.reasons[0])).toMatch(/宿主没有担保/);
    expect(registry.manifests()).toEqual([]);
    expect(registry.board.all()).toEqual([]);
    expect(asked).toEqual(['ghost']);
    warn.mockRestore();
  });

  it('★ 老形状（面自带 manifest、没有 unit）当场点名，不抛也不进名单', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = createClientUnitRegistry();

    registry.register({ manifest: manifest('inventory'), card: () => null } as unknown as UnitClientFace);

    expect(warnLines(warn)).toMatch(/registerUnit\(\{ unit, card \}\)/);
    expect(registry.refusals()).toHaveLength(1);
    expect(registry.manifests()).toEqual([]);
    warn.mockRestore();
  });

  it('★ 宿主收回清单（模块被卸）→ 卡片摘下来，也不静默', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const registry = createClientUnitRegistry();
    registry.setManifests([manifest('issues')]);
    registry.register(face('issues'));

    registry.setManifests([]);

    expect(registry.manifests()).toEqual([]);
    expect(registry.board.all()).toEqual([]);
    expect(warnLines(warn)).toMatch(/宿主不再担保 unit「issues」/);
    expect(registry.refusals().map((item) => item.kind)).toEqual(['withdrawn']);
    warn.mockRestore();
  });

  it('★ 看板的 id / 标题 / 顺序来自宿主担保的那一份清单', () => {
    const registry = createClientUnitRegistry();
    registry.setManifests([manifest('inventory', 3)]);
    registry.register({ unit: 'inventory', card: () => null, steps: { panel: { titleKey: 'x', View: () => null } } });

    expect(registry.board.byId('inventory')).toMatchObject({
      id: 'inventory',
      titleKey: 'inventory.title',
      order: 3,
    });
    expect(registry.board.stepOwner('panel')?.id).toBe('inventory');
  });
});
