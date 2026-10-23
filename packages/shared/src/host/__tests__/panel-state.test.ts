import { describe, expect, it } from 'vitest';
import {
  PANEL_STATE_CRASH_WINDOW_MS,
  PANEL_STATE_MAX_CARDS,
  createPanelStateStore,
  parseCardsReport,
  parseCrashReport,
} from '../panel-state.js';

function card(unit: string, route: string, phase: 'idle' | 'loading' | 'ready' | 'error', at: number) {
  return { unit, route, phase, at };
}

describe('parseCardsReport', () => {
  it('收下一条能认的上报', () => {
    const parsed = parseCardsReport({
      workspace: '/w/a',
      cards: [{ unit: 'demo', route: 'demo/overview', phase: 'ready', at: 10 }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.cards).toEqual([{ unit: 'demo', route: 'demo/overview', phase: 'ready', at: 10 }]);
  });

  it('不认的字段直接丢掉，认不出任何一条就拒收（不当成"面板是空的"）', () => {
    const parsed = parseCardsReport({
      workspace: '/w/a',
      cards: [{ unit: 'demo', route: '', phase: 'ready', at: 1 }, { unit: 'demo', phase: 'weird' }],
    });
    expect(parsed.ok).toBe(false);
  });

  it('没有 workspace 就拒收（面板运行态是按工作区存的）', () => {
    expect(parseCardsReport({ cards: [card('demo', 'demo/o', 'ready', 1)] }).ok).toBe(false);
    expect(parseCardsReport({ workspace: '   ', cards: [] }).ok).toBe(false);
  });

  it('错误码与正文都留着，空错误对象不算错误', () => {
    const parsed = parseCardsReport({
      workspace: '/w/a',
      cards: [
        { unit: 'demo', route: 'demo/o', phase: 'error', at: 3, error: { code: 'host-500', message: '宿主炸了' } },
        { unit: 'demo', route: 'demo/p', phase: 'ready', at: 4, error: {} },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.cards[0]?.error).toEqual({ code: 'host-500', message: '宿主炸了' });
    expect(parsed.value.cards[1]?.error).toBeUndefined();
  });
});

describe('parseCrashReport', () => {
  it('没有原因的崩溃不收（收了也查不了）', () => {
    expect(parseCrashReport({ workspace: '/w/a', unit: 'demo', reason: ' ' }).ok).toBe(false);
    expect(parseCrashReport({ workspace: '/w/a', reason: 'boom' }).ok).toBe(false);
    expect(parseCrashReport({ unit: 'demo', reason: 'boom' }).ok).toBe(false);
  });

  it('没给时间就按收到的那一刻算', () => {
    const parsed = parseCrashReport({ workspace: '/w/a', unit: 'demo', reason: 'boom' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.at).toBeGreaterThan(0);
  });
});

describe('createPanelStateStore', () => {
  it('按工作区 + unit + route 记最新一条（同一 route 后报的盖掉先报的）', () => {
    const store = createPanelStateStore();
    store.cards({ workspace: '/w/a', cards: [card('demo', 'demo/o', 'loading', 1)] });
    store.cards({ workspace: '/w/a', cards: [card('demo', 'demo/o', 'ready', 2)] });
    const snapshot = store.snapshot('/w/a');
    expect(snapshot.units).toHaveLength(1);
    expect(snapshot.units[0]?.cards).toEqual([{ unit: 'demo', route: 'demo/o', phase: 'ready', at: 2 }]);
    expect(snapshot.units[0]?.okAt).toBe(2);
  });

  it('别的工作区的上报不出来（面板按工作区分家）', () => {
    const store = createPanelStateStore();
    store.cards({ workspace: '/w/a', cards: [card('demo', 'demo/o', 'ready', 5)] });
    expect(store.snapshot('/w/b').units).toEqual([]);
    expect(store.snapshot(null)).toEqual({ workspace: null, at: 0, units: [] });
  });

  it('没读到过数据时 okAt 是 null（"读到过"不能靠 unit 有上报就算）', () => {
    const store = createPanelStateStore();
    store.cards({ workspace: '/w/a', cards: [card('demo', 'demo/o', 'error', 7)] });
    expect(store.snapshot('/w/a').units[0]?.okAt).toBeNull();
  });

  it('同一个 unit 反复崩只留最新一条 + 次数（不刷屏）', () => {
    const store = createPanelStateStore();
    store.crash({ workspace: '/w/a', unit: 'demo', reason: 'boom', at: 100 });
    store.crash({ workspace: '/w/a', unit: 'demo', reason: 'boom', at: 200 });
    const crash = store.snapshot('/w/a').units[0]?.crash;
    expect(crash).toEqual({ unit: 'demo', reason: 'boom', at: 200, count: 2 });
  });

  it('换了原因、或隔太久，就重新数', () => {
    const store = createPanelStateStore();
    store.crash({ workspace: '/w/a', unit: 'demo', reason: 'boom', at: 100 });
    store.crash({ workspace: '/w/a', unit: 'demo', reason: 'other', at: 200 });
    expect(store.snapshot('/w/a').units[0]?.crash?.count).toBe(1);
    store.crash({ workspace: '/w/a', unit: 'demo', reason: 'other', at: 200 + PANEL_STATE_CRASH_WINDOW_MS + 1 });
    expect(store.snapshot('/w/a').units[0]?.crash?.count).toBe(1);
  });

  it('一个 unit 的卡最多留这么多条（长命的页面不会把它撑成日志）', () => {
    const store = createPanelStateStore();
    for (let index = 0; index < PANEL_STATE_MAX_CARDS + 4; index += 1) {
      store.cards({ workspace: '/w/a', cards: [card('demo', `demo/r${String(index)}`, 'ready', index + 1)] });
    }
    expect(store.snapshot('/w/a').units[0]?.cards.length).toBe(PANEL_STATE_MAX_CARDS);
  });

  it('两份 store 各记各的（工厂不是单例）', () => {
    const one = createPanelStateStore();
    const two = createPanelStateStore();
    one.cards({ workspace: '/w/a', cards: [card('demo', 'demo/o', 'ready', 1)] });
    expect(two.snapshot('/w/a').units).toEqual([]);
  });
});
