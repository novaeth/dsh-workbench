import { describe, expect, it } from 'vitest';
import { createDiyRig } from './diy-harness';
import { healthOf } from '../model/diy-report';
import { createUnitRegistry } from '@/kernel/host/unit-registry';
import { applyPlanFailures } from '@/kernel/host/mount-units';
import { DIY_STATUS_TOOL } from '../unit';

const rig = createDiyRig();

type StatusRow = {
  unit: string;
  installed: boolean;
  known: boolean;
  health: { state: 'ok' | 'failed' | 'absent'; reason?: string };
  next: string;
};

async function statusOf(
  options: Parameters<ReturnType<typeof createDiyRig>['harness']>[0],
  unit = 'demo',
): Promise<{ status: StatusRow[]; text: string }> {
  const { tool } = rig.harness(options);
  const out = (await tool(DIY_STATUS_TOOL).execute({ unit }, rig.diyExec())) as {
    status: StatusRow[];
    text: string;
  };
  return out;
}

describe('workbench_diy · 起得来没（装配失败的现场）', () => {
  it('装配期抛过的 unit：status 说的不是"都在生效"，而是它起不来 + 原因', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    const out = await statusOf({ failures: { demo: '路由形状不对：routes 少了 overview' } });

    expect(out.status[0]?.health).toEqual({ state: 'failed', reason: '路由形状不对：routes 少了 overview' });
    expect(out.status[0]?.next).toContain('它起不来');
    expect(out.status[0]?.next).toContain('别去重装');
    expect(out.text).toContain('起得来：不是 —— 路由形状不对');
  });

  it('声明被拒（没挂上）也走同一支：原因来自 refusals，不是"重启一次试试"', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    const out = await statusOf({ refused: [{ unit: 'demo', reasons: ['单元 id "demo" 与别的撞了'] }] });

    expect(out.status[0]?.health).toEqual({ state: 'failed', reason: '单元 id "demo" 与别的撞了' });
    expect(out.status[0]?.next).toContain('它起不来');
  });

  it('挂上了就是"起来了"（不再靠"面板认得 + 开着"这两件事推）', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    const out = await statusOf({ mounted: ['panels', 'demo'] });

    expect(out.status[0]?.health.state).toBe('ok');
    expect(out.text).toContain('起得来：是');
  });

  it('装了但工作台根本没读到它的声明：说清是"还没读到"，不是"没装"', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    const out = await statusOf({ mounted: ['panels'] });

    expect(out.status[0]?.health.state).toBe('absent');
    expect(out.status[0]?.health.reason).toContain('重启');
  });

  it('没装：起得来那一格直说还没装（不假装它在跑）', async () => {
    rig.scaffold('demo');
    const out = await statusOf({ mounted: ['panels'] });
    expect(out.status[0]?.health).toEqual({ state: 'absent', reason: '还没装' });
  });
});

describe('★ 计划里被摘掉的套件，必须一路走到 status（少一环 = 假绿）', () => {
  it('★★ 路由名越界那种：套件还在册、路由已被摘，registry 不记就说"起得来：是"', () => {
    const declaration = { apiVersion: 1, unit: 'demo', card: null, tools: [], host: { inject: [] } };
    const registry = createUnitRegistry({
      declarationOf: (unit) =>
        unit === 'demo' ? { pkg: '@t/module-demo', declaration } : undefined,
    });
    registry.register({ unit: 'demo', mount: () => ({ routes: {}, registerTools: () => [] }) });

    expect(healthOf({ registry, unit: 'demo', installed: true })).toEqual({ state: 'ok' });

    const reason =
      '路由名要住在自己那一格的命名空间里（demo 或 demo/…）：ghost/roster 不属于 demo —— ' +
      '装 / 升 / 卸时点名不到它，那个模块的数据会停在旧值';
    applyPlanFailures([{ id: 'demo', reason }], {
      note: (unit, text) => registry.fail(unit, text),
      warn: () => {},
    });

    expect(healthOf({ registry, unit: 'demo', installed: true })).toEqual({ state: 'failed', reason });
  });

  it('每一份失败的记录都要同时进 registry 与日志（漏一个都会让人以为它好好的）', () => {
    const noted: Array<[string, string]> = [];
    const warned: string[] = [];

    applyPlanFailures(
      [
        { id: 'a', reason: '路由名冲突：a/list 由套件 a 与 a 同时声明' },
        { id: 'b', reason: '路由名要住在自己那一格的命名空间里（b 或 b/…）：issues 不属于 b' },
      ],
      { note: (unit, reason) => noted.push([unit, reason]), warn: (message) => warned.push(message) },
    );

    expect(noted.map((one) => one[0])).toEqual(['a', 'b']);
    expect(warned).toHaveLength(2);
    expect(warned[0]).toContain('a 套件起不来');
  });
});
