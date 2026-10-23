import { readFileSync } from 'node:fs';
import type { DebugState } from '@dsh-workbench/shared/host';
import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import { zh } from '@dsh-workbench/shared';

import { debugFooterView } from '../DebugFooterAction';
import { DEBUG_FOOTER_ID, DEBUG_FOOTER_ORDER } from '../debug-footer';
import { DIY_DEBUG_FACT, DIY_DEBUG_ROUTE } from '@/shared/hooks/use-diy-debug';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

const FOOTER = read('DebugFooterAction.tsx');
const FOOTER_CSS = read('DebugFooterAction.module.css');
const REGISTER = read('debug-footer.tsx');
const RIGHTBAR = read('../rightbar/Rightbar.tsx');
const BOARD_FACT = read('../rightbar/board-fact.ts');
const PAGE = read('../../../modules/panels/model/diy-page.ts');
const SIDEBAR = read('Sidebar.tsx');
const SCRIPTS = read('../../../modules/panels/model/diy-scripts.ts');
const HOOK = read('../../../shared/hooks/use-diy-debug.ts');

const t: Translate = (key, params) => {
  const template = (zh as Record<string, string>)[key] ?? key;
  return Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    template,
  );
};

const state = (over: Partial<DebugState> = {}): DebugState => {
  const now = Date.now();
  return {
    phase: 'debugging',
    sessionId: 's1',
    workspacePath: '/w/workbench/diy',
    title: '工坊',
    board: '/w/workbench/diy',
    unit: 'wallet',
    name: '钱包卡',
    startedAt: now,
    at: now,
    ...over,
  };
};

describe('底部那一格：一行状态 + 一句指引', () => {
  it('★★ 都在位上 ⇒ 状态词 + "别切走"，点与字都是黄的', () => {
    const view = debugFooterView(state(), t, 'none');

    expect(view.stalled).toBe(false);
    expect(view.trouble).toBe('none');
    expect(view.label).toBe('「工坊」调试中');
    expect(view.title).toBe('正在调试「工坊」');
    expect(view.note).toBe('请勿切换工作区和操作面板');
  });

  it('★★ 你不在这一场调试那条工作区 ⇒ 那一行改说"异常"，指引是"切回去"', () => {
    const view = debugFooterView(state(), t, 'workspace');

    expect(view.trouble).toBe('workspace');
    expect(view.label).toBe('调试要你看一眼（工坊）');
    expect(view.note).toBe('请切回「工坊」那一屏');
  });

  it('★★ 人在那条工作区、可那块板没画在屏上 ⇒ 那一行改说"异常"，指引是"切面板"', () => {
    const view = debugFooterView(state(), t, 'panel');

    expect(view.trouble).toBe('panel');
    expect(view.label).toBe('调试要你看一眼（工坊）');
    expect(view.note).toBe('请切回工作台面板');
  });

  it('★★ 暂停时：屏在哪都不喊异常（切工作区 / 面板收起来都随你），只说"已暂停"', () => {
    const mine = debugFooterView(state({ phase: 'paused' }), t, 'none');
    const away = debugFooterView(state({ phase: 'paused' }), t, 'workspace');
    const panel = debugFooterView(state({ phase: 'paused' }), t, 'panel');

    for (const view of [mine, away, panel]) {
      expect(view.label).toBe('调试已暂停（工坊）');
      expect(view.note).toBe('已暂停');
      expect(view.trouble).toBe('none');
      expect(view.stalled).toBe(true);
    }
    const running = debugFooterView(state({ phase: 'debugging' }), t, 'panel');
    expect(running.label).toBe('调试要你看一眼（工坊）');
    expect(running.note).toBe('请切回工作台面板');
    expect(running.trouble).toBe('panel');
  });

  it('★★ 没有调试态 ⇒ 整个不渲染（回 null，不留空行）', () => {
    expect(FOOTER).toContain('if (state === null) return null;');
  });

  it('★★ 展开态用 tooltip 说指引、那一行只说状态；折叠轨才用浮层', () => {
    expect(FOOTER).toContain('<Tip');
    expect(FOOTER).toContain('<HoverCard');
    expect(FOOTER).toContain('styles.entryLine');
    expect(FOOTER).toContain('{view.label}');
  });

  it('★★ 三色一颗呼吸点：跑着绿、暂停黄、挡路红；**只有跑着且在位才呼吸**', () => {
    expect(FOOTER).not.toContain('IconInspectOutlineRegular');
    expect(FOOTER).toContain("view.trouble !== 'none' ? 'error' : view.stalled ? 'warning' : 'done'");
    expect(FOOTER).toContain("view.trouble === 'none' && !view.stalled ? styles.pulse : undefined");
    expect(FOOTER).not.toContain('<svg');
    expect(FOOTER_CSS).toContain('--dsw-alias-state-success-primary');
    expect(FOOTER_CSS).toContain('--dsw-alias-state-warn-primary');
    expect(FOOTER_CSS).toContain('--dsw-alias-state-error-primary');
    expect(FOOTER_CSS).toContain('@keyframes wb-debug-breathe');
    expect(FOOTER_CSS).toContain('prefers-reduced-motion');
  });

  it('★★ 形状跟侧栏自己的行同款（.wb-panelRow：36 高、radius md、margin 0 var(--wb-len-2)、padding var(--wb-len-7) var(--wb-len-8)）', () => {
    expect(FOOTER_CSS).toContain('min-height: var(--wb-len-36)');
    expect(FOOTER_CSS).toContain('border-radius: var(--dsw-radius-md)');
    expect(FOOTER_CSS).toContain('margin: 0 var(--wb-len-2)');
    expect(FOOTER_CSS).toContain('padding: var(--wb-len-7) var(--wb-len-8)');
  });

  it('★ 点与字挨近点；那一行放不下就省略号，不换行', () => {
    expect(FOOTER_CSS).toContain('gap: var(--wb-len-4)');
    expect(FOOTER_CSS).toContain('text-overflow: ellipsis');
    expect(FOOTER_CSS).toContain('white-space: nowrap');
  });

  it('★ 折叠轨里退成一颗 36×36 的圆点（居中、无字）', () => {
    expect(FOOTER_CSS).toContain('border-radius: 50%');
    expect(FOOTER_CSS).toContain('width: var(--wb-len-36)');
    expect(FOOTER).toContain('actionRail');
  });

  it('★★ 刷新中不许回 null：那一格会先卸载再挂回来 ⇒ "整条闪一下"（呼吸也重来）', () => {
    expect(HOOK).toContain('if (read.value === undefined) return null;');
    expect(HOOK).not.toContain("if (read.phase !== 'ready') return null;");
  });

  it('★★ 只有「结束」上色（红）；暂停 / 继续保持中性（一行里不许花花绿绿）', () => {
    expect(FOOTER_CSS).toContain('.actStop:hover');
    expect(FOOTER_CSS).toContain('--dsw-alias-state-error-primary');
    expect(FOOTER_CSS).not.toContain('actPause');
    expect(FOOTER_CSS).not.toContain('actResume');
    expect(FOOTER).not.toContain('styles.actResume');
    expect(FOOTER).not.toContain('styles.actPause');
    expect(FOOTER_CSS).toContain('background: var(--dsw-alias-interactive-bg-hover);');
    expect(FOOTER_CSS).not.toContain('border: 0.5px solid');
  });

  it('★★ hook 一律在早退之前（踩过：useState 写在 `if (state === null) return null` 后面 ⇒ 第一帧 4 个、第二帧 5 个 ⇒ 整格被摘掉，表现是"整条没了"）', () => {
    const early = FOOTER.indexOf('if (state === null) return null;');
    expect(early).toBeGreaterThan(0);
    for (const hook of ['useState(false)', 'useSyncExternalStore(', 'useBoardWorkspace(']) {
      const at = FOOTER.indexOf(hook);
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(early);
    }
  });

  it('★★ 这一格有两个身份：状态那块只读；三个键是**用户自己按**的（不是 agent 的工具）', () => {
    expect(FOOTER).not.toContain('workbench_diy_debug');
    expect(FOOTER).toContain('role="status"');
    expect(FOOTER).toContain("press('pause')");
    expect(FOOTER).toContain("press('resume')");
    expect(FOOTER).toContain('onClick={onStop}');
    expect(FOOTER).toContain('view.stalled ?');
    expect(FOOTER).toContain('IconPauseOutlineRegular');
    expect(FOOTER).toContain('IconPlayOutlineRegular');
    expect(FOOTER).toContain('IconStopFillRegular');
    expect(FOOTER).toContain('aria-label={t(');
    expect(FOOTER).toContain('styles.actArmed');
    expect(FOOTER).toContain('data-act-state={armed ?');
    expect(FOOTER).toContain("t('debug.act.stop.ask')");
    expect(FOOTER_CSS).toContain('color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%');
    expect(HOOK).toContain('useHostWrite<{ text?: string }>(');
    expect(FOOTER).not.toContain("role: 'user'");
    expect(HOOK).not.toContain("role: 'user'");
  });

  it('★★ 屏是用户的：这一格不切工作区、不代他动屏', () => {
    expect(FOOTER).not.toContain('selectProject');
    expect(FOOTER).not.toContain('useEffect');
    expect(REGISTER).not.toContain('selectProject');
  });

  it('★★ 判据只有一份：那一格与宿主那道闸共用 shared 的 boardFactOf / boardSituation（防以后漂移）', () => {
    expect(FOOTER).toContain('boardSituation(full, workspacePath)');
    expect(PAGE).toContain('boardFactOf(');
    expect(PAGE).toContain('boardSituation(');
    expect(FOOTER).toContain('useBoardWorkspace(workspaces, sessions)');
    expect(SIDEBAR).toContain('data-wb-where={board.path ?? undefined}');
    expect(SCRIPTS).toContain("getAttribute('data-wb-where')");
    expect(BOARD_FACT).toContain('publishBoardProbe');
    expect(BOARD_FACT).toContain('subscribeBoardProbe');
    expect(BOARD_FACT).toContain('BOARD_PROBE_UNKNOWN');
    expect(RIGHTBAR).toContain('publishBoardProbe({');
    expect(RIGHTBAR).toContain('getComputedStyle(el)');
    expect(RIGHTBAR).toContain('ResizeObserver');
    expect(RIGHTBAR).toContain('useLayoutEffect');
    expect(RIGHTBAR).toContain('data-wb-board');
    expect(FOOTER).toContain('useSyncExternalStore(subscribeBoardProbe, boardProbe)');
    expect(FOOTER).toContain('state.workspacePath');
    expect(FOOTER).not.toContain('isWorkshopPath');
  });

  it('★★ 登记进 sidebar.footer.action：id 与 order 写死，不注入任何"能动手"的东西', () => {
    expect(DEBUG_FOOTER_ID).toBe('workbench-debug');
    expect(DEBUG_FOOTER_ID).not.toBe('cordis-panel');
    expect(DEBUG_FOOTER_ORDER).toBeGreaterThan(0);
    expect(REGISTER).toContain('registerDebugFooter');
    expect(REGISTER).toContain("ctx.slots.inject('sidebar.footer.action'");
    expect(REGISTER).toContain('order: DEBUG_FOOTER_ORDER');
    expect(REGISTER).toContain('locale: LOCALE_NS');
    expect(REGISTER).not.toContain('inject:');
  });
});

describe('板头条：那一面已下线（用户 2026-10-17 拍板，只留左栏底部那一格）', () => {
  it('★★ 右栏不再画它，词条也一起清掉（别留半条）', () => {
    expect(RIGHTBAR).not.toContain('DebugStrip');
    expect((zh as Record<string, string>)['debug.strip.active']).toBeUndefined();
    expect((zh as Record<string, string>)['debug.strip.note']).toBeUndefined();
    expect((zh as Record<string, string>)['debug.stripStalled']).toBeUndefined();
  });
});

describe('读宿主那条只读路由：走唯一那条读路径，不冒充面板取数', () => {
  it('★★ 路由与事实名各一处真相，且显式关掉"面板取数上报"', () => {
    expect(DIY_DEBUG_ROUTE).toBe('panels/diy-debug');
    expect(DIY_DEBUG_FACT).toBe('diy-debug');
    expect(HOOK).toContain('useApiResource');
    expect(HOOK).toContain('report: false');
    expect(HOOK).not.toContain('apiGet');
  });
});
