import { describe, expect, it } from 'vitest';
import type { UnitModuleFace } from '@dsh-workbench/shared/host';
import { unitTitleKey } from '@dsh-workbench/shared/host';
import { createUnitRegistry } from '../unit-registry';

function declaration(unit: string): unknown {
  return {
    apiVersion: 3,
    unit,
    title: { zh: `模块 ${unit}`, en: `Module ${unit}` },
    card: null,
    tools: [],
    host: { inject: [] },
  };
}

function registryOf(known: readonly string[] = ['issues', 'inventory']) {
  return createUnitRegistry({
    declarationOf: (unit) =>
      known.includes(unit) ? { pkg: `@t/module-${unit}`, declaration: declaration(unit) } : undefined,
  });
}

function face(unit: string): UnitModuleFace {
  return { unit, mount: () => ({ routes: {}, registerTools: () => [] }) };
}

describe('createUnitRegistry', () => {
  it('注册进来的套件按注册顺序可见', () => {
    const registry = registryOf();
    registry.register(face('issues'));
    registry.register(face('inventory'));

    expect(registry.all().map((item) => item.manifest.id)).toEqual(['issues', 'inventory']);
  });

  it('manifests 跟着注册走', () => {
    const registry = registryOf();
    const dispose = registry.register(face('issues'));

    expect(registry.manifests().map((item) => item.id)).toEqual(['issues']);
    dispose();
    expect(registry.manifests()).toEqual([]);
  });

  it('id 重复当场抛（id 会进持久化配置，不能撞）', () => {
    const registry = registryOf();
    registry.register(face('issues'));

    expect(() => registry.register(face('issues'))).toThrow(/重复/);
  });

  it('注销之后那个 id 可以再注册（装卸一轮不该留下残留）', () => {
    const registry = registryOf();
    const dispose = registry.register(face('issues'));
    dispose();

    expect(() => registry.register(face('issues'))).not.toThrow();
    expect(registry.all()).toHaveLength(1);
  });

  it('重复注销是安全的（幂等）', () => {
    const registry = registryOf();
    const dispose = registry.register(face('issues'));
    dispose();

    expect(() => dispose()).not.toThrow();
  });

  it('注册与注销都通知订阅者；退订之后不再通知', () => {
    const registry = registryOf();
    let count = 0;
    const unsubscribe = registry.subscribe(() => {
      count += 1;
    });

    const dispose = registry.register(face('issues'));
    dispose();
    expect(count).toBe(2);

    unsubscribe();
    registry.register(face('inventory'));
    expect(count).toBe(2);
  });

  it('清单不是模块自己交上来的：外壳按 unit 从已装清单读出来', () => {
    const registry = registryOf();
    registry.register(face('issues'));

    const host = registry.all()[0];
    expect(host?.manifest.id).toBe('issues');
    expect(host?.source).toEqual({ kind: 'package', pkg: '@t/module-issues' });
    expect(host?.manifest.card).toBeNull();
  });

  it('★ 没有 unit 的注册请求（U1b 之前的旧形状）：不挂载，但**记下拒因**并说清照怎么做', () => {
    const registry = registryOf();

    expect(() => registry.register({ mount: () => ({ routes: {}, registerTools: () => [] }) } as never)).not.toThrow();
    expect(registry.all()).toHaveLength(0);
    expect(registry.refusals()[0]?.reasons.join(' ')).toMatch(/register\(\{ unit, mount \}\)/);
  });

  it('★ 已装清单里没有这个 unit：不挂载、记下拒因（而不是静默挂上一个空壳）', () => {
    const registry = registryOf();

    registry.register(face('nobody'));

    expect(registry.all()).toHaveLength(0);
    expect(registry.refusals()[0]?.unit).toBe('nobody');
    expect(registry.refusals()[0]?.reasons.join(' ')).toMatch(/没有哪个已装模块声明了 unit/);
  });

  it('★ 声明读不了（缺 apiVersion）：不挂载，拒因点名是哪个包缺什么', () => {
    const registry = createUnitRegistry({
      declarationOf: () => ({ pkg: '@t/module-broken', declaration: { unit: 'broken' } }),
    });

    registry.register(face('broken'));

    expect(registry.all()).toHaveLength(0);
    expect(registry.refusals()[0]?.pkg).toBe('@t/module-broken');
    expect(registry.refusals()[0]?.reasons.join(' ')).toMatch(/apiVersion/);
  });

  it('★ 拒因要经过 logger 出一句人话（装上了却在日志里一声不响 = 静默失败）', () => {
    const warned: string[] = [];
    const registry = createUnitRegistry({ declarationOf: () => undefined, logger: { warn: (m) => warned.push(m) } });

    registry.register(face('nobody'));

    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain('nobody');
  });

  it('外壳自己的单元走 registerOwned：清单直接给，不从已装清单里找', () => {
    const registry = registryOf([]);
    registry.registerOwned({
      unit: 'panels',
      manifest: { id: 'panels', titleKey: unitTitleKey('panels'), card: null, tools: [], host: { inject: [] } },
      mount: () => ({ routes: {}, registerTools: () => [] }),
    });

    expect(registry.manifests().map((item) => item.id)).toEqual(['panels']);
    expect(registry.all()[0]?.source).toEqual({ kind: 'owned' });
    expect(registry.owned()).toEqual(['panels']);
  });

  it('★ 已装模块的注册不算"外壳自己的"（豁免只认 registerOwned 那条路）', () => {
    const registry = registryOf();
    registry.register(face('issues'));

    expect(registry.owned()).toEqual([]);
  });

  it('★ 合成出来的插件单元走 registerPlugin：进清单，但不算"外壳自己的"（它要按板上开关收窄）', () => {
    const registry = registryOf([]);
    const dispose = registry.registerPlugin({
      unit: 'plugin:opencli-plugin-inventory',
      manifest: {
        id: 'plugin:opencli-plugin-inventory',
        titleKey: unitTitleKey('plugin:opencli-plugin-inventory'),
        card: null,
        tools: [{ name: 'inventory_builds', writes: false }],
        host: { inject: [] },
      },
      mount: () => ({ routes: {}, registerTools: () => [] }),
    });

    expect(registry.manifests().map((item) => item.id)).toEqual(['plugin:opencli-plugin-inventory']);
    expect(registry.all()[0]?.source).toEqual({ kind: 'plugin' });
    expect(registry.owned()).toEqual([]);
    dispose();
    expect(registry.manifests()).toEqual([]);
  });

  it('★ 声明里写 `scope`：协议不认这个键，整条声明被拒并点名它（无垫片）', () => {
    const registry = createUnitRegistry({
      declarationOf: () => ({
        pkg: '@t/module-scoped',
        declaration: {
          apiVersion: 3,
          unit: 'scoped',
          title: { zh: '带 scope 的模块', en: 'Scoped module' },
          card: { order: 10, scope: 'machine' },
          tools: [{ name: 'scoped_read', writes: false, scope: 'workspace' }],
          host: { inject: [] },
        },
      }),
    });

    registry.register(face('scoped'));

    expect(registry.all()).toHaveLength(0);
    const reasons = registry.refusals()[0]?.reasons.join(' ') ?? '';
    expect(reasons).toContain('不认的键');
    expect(reasons).toContain('"scope"');
  });
});

describe('createUnitRegistry · 起得来没（装配失败的现场）', () => {
  it('失败与恢复都记在注册表上，按 unit 取（不靠日志）', () => {
    const registry = registryOf();

    expect(registry.failureOf('inventory')).toBeUndefined();

    registry.fail('inventory', 'routes 少了 overview');
    expect(registry.failureOf('inventory')).toBe('routes 少了 overview');

    registry.recovered('inventory');
    expect(registry.failureOf('inventory')).toBeUndefined();
  });

  it('失败记的是最新那一条（同一个 unit 重挂失败两次不留两条）', () => {
    const registry = registryOf();
    registry.fail('inventory', '第一次：路由形状不对');
    registry.fail('inventory', '第二次：闸门多提供者');

    expect(registry.failureOf('inventory')).toBe('第二次：闸门多提供者');
  });

  it('恢复是幂等的：没失败过也能叫（卸载与同步都会叫）', () => {
    const registry = registryOf();
    expect(() => registry.recovered('never')).not.toThrow();
  });
});
