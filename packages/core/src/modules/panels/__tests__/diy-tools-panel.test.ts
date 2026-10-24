import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createDiyRig } from './diy-harness';
import { DIY_PANEL_TOOL } from '../unit';

const rig = createDiyRig();

type PanelOut = {
  workspace: string | null;
  board: string[];
  panels: Array<{ unit: string; name: string; health: { state: string }; report?: unknown }>;
  text: string;
};

async function panelOf(
  options: Parameters<ReturnType<typeof createDiyRig>['harness']>[0] = {},
  unit?: string,
): Promise<PanelOut> {
  const { tool } = rig.harness(options);
  return (await tool(DIY_PANEL_TOOL).execute(unit === undefined ? {} : { unit }, rig.diyExec())) as PanelOut;
}

function card(unit: string, route: string, phase: 'loading' | 'ready' | 'error', at: number, message = '') {
  return {
    workspace: rig.WORKSHOP(),
    cards: [
      {
        unit,
        route,
        phase,
        at,
        ...(message === '' ? {} : { error: { code: 'host-500', message } }),
      },
    ],
  };
}

describe('workbench_diy · panel（面板上现在究竟是什么样）', () => {
  it('没有任何上报：直说"还没有一条"并给出两种可能，不假装面板是好的', async () => {
    const out = await panelOf();

    expect(out.text).toContain('还没有一条面板运行态上报');
    expect(out.text).not.toContain('读到了');
  });

  it('读到了：报的是最后那一次的时间与新鲜度（不是"卡片存在"这种静态事实）', async () => {
    const { tool, panelState } = rig.harness();
    panelState.cards(card('demo', 'demo/overview', 'ready', dayjs().valueOf() - 5000));
    const out = (await tool(DIY_PANEL_TOOL)?.execute({}, rig.diyExec())) as PanelOut;

    expect(out.text).toContain('demo/overview 读到了');
    expect(out.text).toContain('崩过：没有');
  });

  it('读不到：把宿主回的码与原文带出来（agent 据此决定改哪一段）', async () => {
    const { tool, panelState } = rig.harness();
    panelState.cards(card('demo', 'demo/overview', 'error', Date.now(), '宿主回的是 HTML 页而不是 JSON'));
    const out = (await tool(DIY_PANEL_TOOL)?.execute({}, rig.diyExec())) as PanelOut;

    expect(out.text).toContain('读不到（host-500）');
    expect(out.text).toContain('宿主回的是 HTML 页而不是 JSON');
  });

  it('崩过：原因 + 次数都带出来（同一处反复崩不刷屏，但"还在崩"看得出来）', async () => {
    const { tool, panelState } = rig.harness();
    panelState.crash({ workspace: rig.WORKSHOP(), unit: 'demo', reason: 'Cannot read properties of undefined', at: 1000 });
    panelState.crash({ workspace: rig.WORKSHOP(), unit: 'demo', reason: 'Cannot read properties of undefined', at: 2000 });
    const out = (await tool(DIY_PANEL_TOOL)?.execute({}, rig.diyExec())) as PanelOut;

    expect(out.text).toContain('崩过：是 —— Cannot read properties of undefined');
    expect(out.text).toContain('共 2 次');
  });

  it('面板上开着、但一次也没上报：明说"没上报"，并指出是没渲染还是页面旧', async () => {
    const { tool, panels } = rig.harness();
    panels.show('demo', rig.WORKSHOP());
    const out = (await tool(DIY_PANEL_TOOL)?.execute({}, rig.diyExec())) as PanelOut;

    expect(out.board).toContain('demo');
    expect(out.text).toContain('没上报');
    expect(out.text).toContain('刷新');
  });

  it('别的工作区的上报不算数（面板按工作区分家）', async () => {
    const { tool, panelState } = rig.harness();
    panelState.cards({ ...card('demo', 'demo/overview', 'ready', 1000), workspace: '/w/别的项目' });
    const out = (await tool(DIY_PANEL_TOOL)?.execute({}, rig.diyExec())) as PanelOut;

    expect(out.text).toContain('还没有一条面板运行态上报');
  });

  it('unit 给了就只看那一个（用户说"那张卡"，agent 不必把整块面板读一遍）', async () => {
    const { tool, panelState } = rig.harness();
    panelState.cards(card('demo', 'demo/overview', 'ready', 1000));
    panelState.cards(card('other', 'other/overview', 'ready', 1000));
    const out = (await tool(DIY_PANEL_TOOL)?.execute({ unit: 'other' }, rig.diyExec())) as PanelOut;

    expect(out.panels.map((one) => one.unit)).toEqual(['other']);
  });

  it('装配失败的 unit 在 panel 里也说清它起不来（与 status 同一个口径）', async () => {
    const dir = rig.scaffold('demo');
    rig.markInstalled('@dsh-workbench/module-demo', dir);
    const { tool } = rig.harness({ failures: { demo: 'host 半侧 mount 抛了' } });
    const out = (await tool(DIY_PANEL_TOOL)?.execute({}, rig.diyExec())) as PanelOut;

    expect(out.panels.find((one) => one.unit === 'demo')?.health.state).toBe('failed');
    expect(out.text).toContain('不是 —— host 半侧 mount 抛了');
  });

  it('★★ 会话在模块包的子目录里：那一行说的仍是**登记工作区**（裸 cwd 会读错板上那一家）', async () => {
    const dir = rig.scaffold('demo');
    const sub = path.join(dir, 'src');
    fs.mkdirSync(sub, { recursive: true });
    const { tool, panelState } = rig.harness();
    panelState.cards(card('demo', 'demo/overview', 'ready', 1000));

    const out = (await tool(DIY_PANEL_TOOL)?.execute(
      {},
      { agent: { session: { id: 's1', header: { cwd: sub } } } },
    )) as PanelOut;

    expect(out.workspace).toBe(rig.WORKSHOP());
    expect(out.text).toContain(`工作区：${rig.WORKSHOP()}`);
    expect(out.panels.map((one) => one.unit)).toEqual(['demo']);
  });
});
