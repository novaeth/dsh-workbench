import { describe, expect, it } from 'vitest';
import { DEBUG_STALE_MS, createDebugStore, parseDebugIntent, type DebugPact } from '../diy-debug.js';

const pact = (sessionId: string, now = 1000, unit = 'demo'): DebugPact => ({
  sessionId,
  workspacePath: '/w/diy',
  title: '演示工作区',
  board: '/w/diy',
  unit,
  name: unit,
  now,
});

describe('调试态：一台机器一次一条，谁开始谁收工', () => {
  it('★ 开始 ⇒ debugging，把目标、开始时间与会话都记下', () => {
    const store = createDebugStore();
    const move = store.begin(pact('s1', 1000));

    expect(move.ok).toBe(true);
    if (!move.ok) return;
    expect(move.state.phase).toBe('debugging');
    expect(move.state.unit).toBe('demo');
    expect(move.state.startedAt).toBe(1000);
    expect(store.live(1000)).toEqual(move.state);
  });

  it('★★ 另一场调试占着就不许再开（一次一台机器只允许一场）', () => {
    const store = createDebugStore();
    store.begin(pact('s1', 1000));

    const second = store.begin(pact('s2', 1200));

    expect(second).toEqual({ ok: false, code: 'held-by-other' });
    expect(store.live(1200)?.sessionId).toBe('s1');
  });

  it('★ 同一个会话再来一次 ⇒ already-held（换目标要先收工，或接着看用 resume）', () => {
    const store = createDebugStore();
    store.begin(pact('s1', 1000));

    expect(store.begin(pact('s1', 1100))).toEqual({ ok: false, code: 'already-held' });
  });

  it('★ 暂停 / 继续 / 收工的正常路径：每回都换 at，不动 startedAt', () => {
    const store = createDebugStore();
    store.begin(pact('s1', 1000));

    const paused = store.pause('s1', 2000);
    expect(paused.ok && paused.state.phase).toBe('paused');
    expect(paused.ok && paused.state.at).toBe(2000);

    const resumed = store.resume('s1', 3000);
    expect(resumed.ok && resumed.state.phase).toBe('debugging');
    expect(resumed.ok && resumed.state.startedAt).toBe(1000);

    const stopped = store.stop('s1', 4000);
    expect(stopped.ok && stopped.state.unit).toBe('demo');
    expect(store.live(4000)).toBeNull();
  });

  it('★ 没开始就暂停 / 继续 / 收工 ⇒ none；暂停态里再暂停 ⇒ already-paused；调试中再继续 ⇒ already-debugging', () => {
    const store = createDebugStore();

    expect(store.pause('s1', 1000)).toEqual({ ok: false, code: 'none' });
    expect(store.resume('s1', 1000)).toEqual({ ok: false, code: 'none' });
    expect(store.stop('s1', 1000)).toEqual({ ok: false, code: 'none' });

    store.begin(pact('s1', 1000));
    expect(store.resume('s1', 1000)).toEqual({ ok: false, code: 'already-debugging' });
    expect(store.pause('s1', 2000).ok).toBe(true);
    expect(store.pause('s1', 2500)).toEqual({ ok: false, code: 'already-paused' });
  });

  it('★★ 别人不许动我的调试态（not-owner）—— 谁开始谁收工', () => {
    const store = createDebugStore();
    store.begin(pact('s1', 1000));

    expect(store.pause('s2', 1500)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.resume('s2', 1500)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.stop('s2', 1500)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.live(1500)?.sessionId).toBe('s1');
  });

  it('★★ 状态机里没有"自动落 paused"这回事：只有 agent 主动 pause / resume / stop（2026-10-17 夜口径）', () => {
    const store = createDebugStore();
    store.begin(pact('s1', 1000));

    expect(Object.keys(store)).toEqual(['live', 'begin', 'pause', 'resume', 'stop']);
    expect(store.live(2000)?.phase).toBe('debugging');
  });

  it('★ 过期当它不存在（时间隔太久，别把上一场调试留给下一个人）', () => {
    const store = createDebugStore();
    store.begin(pact('s1', 1000));

    expect(store.live(1000 + DEBUG_STALE_MS)).not.toBeNull();
    expect(store.live(1001 + DEBUG_STALE_MS)).toBeNull();
    expect(store.begin(pact('s2', 1001 + DEBUG_STALE_MS)).ok).toBe(true);
  });
});

describe('用户在那一格上按的三个键：意图词表只此一份', () => {
  it('★ 认得出三个，其余一律 null（别把别的字当成指令）', () => {
    expect(parseDebugIntent('pause')).toBe('pause');
    expect(parseDebugIntent('resume')).toBe('resume');
    expect(parseDebugIntent('stop')).toBe('stop');
    for (const bad of ['', 'PAUSE', 'Pause', 'kill', 'end', null, undefined, 1, {}, []]) {
      expect(parseDebugIntent(bad)).toBeNull();
    }
  });
});
