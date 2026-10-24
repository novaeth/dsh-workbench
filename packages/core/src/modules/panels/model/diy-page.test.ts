import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { DshHostContext, DshToolRunContext } from '@dsh-workbench/shared';
import { createDiyRig } from '../__tests__/diy-harness';
import type { WorkbenchPage } from './diy-browser';
import { boardStateOf, debugOffBoardText, pageAt } from './diy-page';
import {
  DIY_CLICK_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_HTML_TOOL,
  DIY_LOGS_WATCH_TOOL,
  DIY_NETWORK_TOOL,
} from '../unit';

const PAGE = JSON.stringify({ plugin: '@dsh-workbench/core', pid: 1, url: 'http://127.0.0.1:3081/', open: true, shown: true, title: '工作台' });
const OTHER = JSON.stringify({ plugin: null, pid: null, url: 'https://example.com/', title: '别的站' });

describe('那一页的握手：看一眼与动手共用同一条路', () => {
  const rig = createDiyRig();

  it('★★ 已经绑着工作台 ⇒ 不 bind，把 unit 与 shell 一起交出去', async () => {
    const built = rig.harness({ withTools: true, probe: [{ stdout: PAGE }] });
    const page = await pageAt(built.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, {
      unit: 'demo',
    });

    expect(page.unit).toBe('demo');
    expect(page.bound).toBe(false);
    expect(page.session).toBe('workbench');
    expect(page.root).toContain(rig.WORKSHOP());
    expect(built.commands[0]).toContain("'eval'");
    expect(built.commands.some((one) => one.includes("'bind'"))).toBe(false);
  });

  it('★ 工坊里只有一个模块时，不给 unit 也能用（它替你选那一个）', async () => {
    rig.scaffold('demo');
    const one = rig.harness({ withTools: true, probe: [{ stdout: PAGE }] });

    expect((await pageAt(one.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, {})).unit).toBe(
      'demo',
    );
  });

  it('★ 工坊里一个模块都没有 ⇒ 报的是"要一个 unit"，不是一句空错', async () => {
    const none = rig.harness({ withTools: true, probe: [{ stdout: PAGE }], manifests: [] });

    await expect(
      pageAt(none.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, {}),
    ).rejects.toThrow('要一个 unit');
  });

  it('★★ 现在这一页不是工作台 ⇒ 当场说清（默认），要导航/刷新那两把才放行', async () => {
    const built = rig.harness({ withTools: true, probe: [{ stdout: OTHER }] });

    await expect(
      pageAt(built.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, { unit: 'demo' }),
    ).rejects.toThrow('不是工作台');

    const loose = await pageAt(built.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, {
      unit: 'demo',
    }, { requireWorkbench: false });
    expect(loose.unit).toBe('demo');
  });

  it('★ 这台机器上没有 shell ⇒ 老实说动不了浏览器', async () => {
    const built = rig.harness({ withTools: true });

    await expect(
      pageAt(built.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, { unit: 'demo' }),
    ).rejects.toThrow('shell');
  });
});

describe('板事实：那一屏画着哪块板', () => {
  const rig = createDiyRig();
  const page = (over: Partial<WorkbenchPage>): WorkbenchPage => ({
    ok: true,
    url: '',
    title: '',
    where: '',
    board: '',
    open: null,
    shown: false,
    ...over,
  });

  it('★★ 工作台装着但右栏没画（切去看文件预览 / 市场）⇒ hidden，不许退成"问不出来"就放行', () => {
    expect(boardStateOf(page({ open: null, ok: true }), rig.WORKSHOP())).toBe('hidden');
  });

  it('★ 问不出来（旧外壳 / 夹具页：工作台根本没答话）⇒ unknown，不许当成"就是工坊板"', () => {
    expect(boardStateOf(page({ open: null, ok: false }), rig.WORKSHOP())).toBe('unknown');
  });

  it('★ 面板收着 —— 属性在但没开、或算出来不可见 ⇒ hidden', () => {
    expect(boardStateOf(page({ open: false, shown: false, board: rig.WORKSHOP() }), rig.WORKSHOP())).toBe('hidden');
    expect(boardStateOf(page({ open: true, shown: false, board: rig.WORKSHOP() }), rig.WORKSHOP())).toBe('hidden');
  });

  it('★★ 画的是工坊那块板 ⇒ workshop（按路径归属判，不看标题）', () => {
    expect(boardStateOf(page({ open: true, shown: true, board: rig.WORKSHOP() }), rig.WORKSHOP())).toBe('workshop');
    expect(boardStateOf(page({ open: true, shown: true, board: rig.PACKAGES() }), rig.WORKSHOP())).toBe('workshop');
  });

  it('★★ 画的是别的项目的板 ⇒ other', () => {
    expect(boardStateOf(page({ open: true, shown: true, board: '/w/project' }), rig.WORKSHOP())).toBe('other');
  });

  it('★ 开着但板不知道是哪块（夹具页）⇒ unknown', () => {
    expect(boardStateOf(page({ open: true, shown: true, board: '' }), rig.WORKSHOP())).toBe('unknown');
  });

  it('★★ 屏/板不对时那句实话：只拒、不改状态（落不落 paused 是 agent 的决定）', () => {
    const held = {
      phase: 'debugging',
      sessionId: 's1',
      workspacePath: '/w/workbench/diy',
      title: '工坊',
      board: rig.WORKSHOP(),
      unit: 'demo',
      name: 'demo',
      startedAt: 0,
      at: 0,
    } as Parameters<typeof debugOffBoardText>[0];

    expect(debugOffBoardText(held, 'off-workspace')).toContain('不在「工坊」');
    expect(debugOffBoardText(held, 'off-workspace')).toContain('切回「工坊」');
    expect(debugOffBoardText(held, 'panel-closed')).toContain('工作台面板没画在屏上');
    expect(debugOffBoardText(held, 'panel-closed')).toContain('把「工作台面板」切回来');
    expect(debugOffBoardText(held, 'other-board')).toContain('画的不是「工坊」那块板');

    for (const one of ['off-workspace', 'panel-closed', 'other-board'] as const) {
      expect(debugOffBoardText(held, one)).toContain('进行中');
      expect(debugOffBoardText(held, one)).toContain('workbench_diy_debug_pause');
      expect(debugOffBoardText(held, one)).not.toContain('已自动落 paused');
    }
  });

  it('★★ 用户切到别的项目 ⇒ 这一把当场拒：不拿别的板当目标', async () => {
    const built = rig.harness({
      withTools: true,
      probe: [{ stdout: JSON.stringify({ ...JSON.parse(PAGE), board: '/w/project', open: true, shown: true }) }],
    });

    await expect(
      pageAt(built.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, { unit: 'demo' }),
    ).rejects.toThrow('不拿别的板当目标');
  });

  it('★★ 面板收着 ⇒ 收闸，说的是"看不见"，不是"别的板"', async () => {
    const built = rig.harness({
      withTools: true,
      probe: [{ stdout: JSON.stringify({ ...JSON.parse(PAGE), board: rig.WORKSHOP(), open: true, shown: false }) }],
    });

    await expect(
      pageAt(built.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, { unit: 'demo' }),
    ).rejects.toThrow('右栏收着');
  });

  it('★★ 画的就是工坊那块板 ⇒ 放行，并把这格事实报出去（look 的话靠它）', async () => {
    const built = rig.harness({
      withTools: true,
      probe: [{ stdout: JSON.stringify({ ...JSON.parse(PAGE), board: rig.WORKSHOP(), open: true, shown: true }) }],
    });

    const page = await pageAt(built.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, {
      unit: 'demo',
    });

    expect(page.board).toBe('workshop');
  });

  it('★★ 会话开在模块包的子目录里 ⇒ 落点仍是登记工作区，板闸不误拒（cwd ≠ 登记 path 那条裂缝）', async () => {
    const dir = rig.scaffold('demo');
    const sub = path.join(dir, 'src');
    fs.mkdirSync(sub, { recursive: true });
    const built = rig.harness({
      withTools: true,
      probe: [{ stdout: JSON.stringify({ ...JSON.parse(PAGE), board: rig.WORKSHOP(), open: true, shown: true }) }],
    });

    const page = await pageAt(
      built.ctx as unknown as DshHostContext,
      { agent: { session: { id: 's1', header: { cwd: sub } } } } as DshToolRunContext,
      { unit: 'demo' },
    );

    expect(page.board).toBe('workshop');
    expect(page.root).toBe(rig.WORKSHOP());
  });

  it('★★ 屏上那块板不是本会话工作区（用户在别的项目）⇒ 拒，而且一条 verb 都不发', async () => {
    const built = rig.harness({
      withTools: true,
      probe: [
        { stdout: JSON.stringify({ ...JSON.parse(PAGE), where: '/w/other', open: null, shown: false, board: '' }) },
      ],
    });

    await expect(
      built.tool(DIY_CLICK_TOOL).execute({ unit: 'demo', selector: '.wb-cardOpen' }, rig.diyExec()),
    ).rejects.toThrow('不在「工坊」');
    expect(built.commands.filter((one) => one.includes("'click'"))).toEqual([]);
  });

  it('★ 旧外壳（问不出板事实）⇒ 放行（别把整族打死），但报 unknown', async () => {
    const built = rig.harness({ withTools: true, probe: [{ stdout: PAGE }] });

    const page = await pageAt(built.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, {
      unit: 'demo',
    });

    expect(page.board).toBe('unknown');
  });
});

describe('没有调试约定 ⇒ 看 / 动 / 网络 / 日志整族零调用', () => {
  const rig = createDiyRig();
  const ON_BOARD = (): string =>
    JSON.stringify({
      plugin: '@dsh-workbench/core',
      pid: 1,
      url: 'http://127.0.0.1:3081/',
      title: '工作台',
      board: rig.WORKSHOP(),
      open: true,
      shown: true,
    });

  it('★★ 页在前台、板也是工坊那块 —— 没有约定照样当场拒，而且一条命令都不发', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: ON_BOARD() }] });

    await expect(
      pageAt(built.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, { unit: 'demo' }),
    ).rejects.toThrow('没有调试约定');
    expect(built.commands).toEqual([]);
  });

  it('★★ 四族（看 / 动 / 网络 / 日志）一个都调不动，都点出先 start，且拒的时候零 opencli 调用', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: ON_BOARD() }] });

    for (const name of [DIY_HTML_TOOL, DIY_CLICK_TOOL, DIY_NETWORK_TOOL, DIY_LOGS_WATCH_TOOL]) {
      await expect(
        built.tool(name).execute({ unit: 'demo', selector: '.wb-cardOpen' }, rig.diyExec()),
      ).rejects.toThrow('workbench_diy_debug_start');
    }

    expect(built.commands).toEqual([]);
  });

  it('★ 没有约定又不在工坊那块板上：说板（那条板闸还在，是给不走约定的调用方的）', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [{ stdout: JSON.stringify({ ...JSON.parse(ON_BOARD()), board: '/w/project' }) }],
    });

    await expect(
      pageAt(built.ctx as unknown as DshHostContext, rig.diyExec() as DshToolRunContext, { unit: 'demo' }, {
        requirePact: false,
      }),
    ).rejects.toThrow('不拿别的板当目标');
  });

  it('★ 只有开约定那两把能不走约定（start / resume 自己就是那道门）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: ON_BOARD() }] });

    const started = (await built.tool(DIY_DEBUG_START_TOOL).execute({ unit: 'demo' }, rig.diyExec())) as {
      phase: string;
    };

    expect(started.phase).toBe('debugging');
  });
});
