import { describe, expect, it } from 'vitest';
import {
  RECORD_STALE_MS,
  createRecordStore,
  parseRecordIntent,
  recordOwnerText,
  shotDueOf,
  type RecordPact,
  type RecordState,
} from '../diy-record.js';

const pact = (sessionId: string, now = 1000, unit = 'demo'): RecordPact => ({
  sessionId,
  workspace: '/w/diy',
  unit,
  name: unit,
  url: 'https://inventory.example.com/env',
  title: '环境 · Inventory',
  action: '发布',
  expect: { method: 'POST', urlContains: '/api/publish' },
  captureFile: '/w/diy/shots/rec-demo.jsonl',
  now,
});

const held = (move: { ok: true; state: RecordState } | { ok: false; code: string }): RecordState => {
  if (!move.ok) throw new Error(`expected ok, got ${move.code}`);
  return move.state;
};

describe('录制交接：一台机器一次一场，谁开谁收工', () => {
  it('★ begin ⇒ armed，把目标、那一页、那一下、捕获文件都记下', () => {
    const store = createRecordStore();
    const state = held(store.begin(pact('s1', 1000)));

    expect(state.phase).toBe('armed');
    expect(state.unit).toBe('demo');
    expect(state.url).toBe('https://inventory.example.com/env');
    expect(state.action).toBe('发布');
    expect(state.expect).toEqual({ method: 'POST', urlContains: '/api/publish' });
    expect(state.captureFile).toBe('/w/diy/shots/rec-demo.jsonl');
    expect(state.startedAt).toBe(1000);
    expect(state.t0).toBeNull();
    expect(state.t1).toBeNull();
    expect(store.live(1000)).toEqual(state);
  });

  it('★★ 另一场占着就不许再开；同一个会话再来一次 ⇒ already-held', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    expect(store.begin(pact('s2', 1200))).toEqual({ ok: false, code: 'held-by-other' });
    expect(store.begin(pact('s1', 1300))).toEqual({ ok: false, code: 'already-held' });
    expect(store.live(1300)?.sessionId).toBe('s1');
  });

  it('★ 用户按「开始」⇒ recording，t0 是他按的那一刻（不是 store 收到的那一刻）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    const state = held(store.started('s1', 2000, 2001));
    expect(state.phase).toBe('recording');
    expect(state.t0).toBe(2000);
    expect(state.at).toBe(2001);
    expect(state.startedAt).toBe(1000);
  });

  it('★ 用户按「结束」⇒ finished，t1 落下来；再按一次「结束」⇒ not-recording', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));
    store.started('s1', 2000, 2001);

    const state = held(store.finished('s1', 5000, 5002));
    expect(state.phase).toBe('finished');
    expect(state.t1).toBe(5000);
    expect(store.finished('s1', 6000, 6000)).toEqual({ ok: false, code: 'not-recording' });
  });

  it('★★ 阶段不对就说清是哪一档：还没开始就结束 / 已经开始又按开始', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    expect(store.finished('s1', 1500, 1500)).toEqual({ ok: false, code: 'not-recording' });

    store.started('s1', 2000, 2000);
    expect(store.started('s1', 2100, 2100)).toEqual({ ok: false, code: 'already-recording' });

    store.finished('s1', 3000, 3000);
    expect(store.started('s1', 3100, 3100)).toEqual({ ok: false, code: 'not-armed' });
  });

  it('★★ 一场就一个周期：finished 之后回不去了（没有「再录一段」，要重录就重新 begin 一场）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));
    store.started('s1', 2000, 2000);
    store.finished('s1', 3000, 3000);

    const state = store.live(3000);
    expect(state?.phase).toBe('finished');
    expect(state?.t0).toBe(2000);
    expect(state?.t1).toBe(3000);
    expect(store.started('s1', 3100, 3100)).toEqual({ ok: false, code: 'not-armed' });
    expect(store.finished('s1', 3200, 3200)).toEqual({ ok: false, code: 'not-recording' });
    expect(store.live(3300)?.phase).toBe('finished');
  });

  it('★ 收工把它清干净（取消那一拍也走它）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    const stopped = held(store.stop('s1', 1500));
    expect(stopped.unit).toBe('demo');
    expect(store.live(1500)).toBeNull();
    expect(store.stop('s1', 1600)).toEqual({ ok: false, code: 'none' });
  });

  it('★★ 别人不许动我这一场（not-owner）；没开过 ⇒ none', () => {
    const store = createRecordStore();

    expect(store.started('s1', 1000, 1000)).toEqual({ ok: false, code: 'none' });
    expect(store.finished('s1', 1000, 1000)).toEqual({ ok: false, code: 'none' });
    expect(store.stop('s1', 1000)).toEqual({ ok: false, code: 'none' });

    store.begin(pact('s1', 1000));
    expect(store.started('s2', 1100, 1100)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.finished('s2', 1100, 1100)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.stop('s2', 1100)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.live(1100)?.sessionId).toBe('s1');
  });

  it('★ 过期当它不存在（15 分钟没人管就放别人进来）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    expect(store.live(1000 + RECORD_STALE_MS)).not.toBeNull();
    expect(store.live(1001 + RECORD_STALE_MS)).toBeNull();
    expect(store.begin(pact('s2', 1001 + RECORD_STALE_MS)).ok).toBe(true);
    expect(store.live(1001 + RECORD_STALE_MS)?.sessionId).toBe('s2');
  });

  it('★ 录制中不被 TTL 拽走：at 每动一次就续上（他正在那一页上操作）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    const late = 1000 + RECORD_STALE_MS;
    const state = held(store.started('s1', late, late));
    expect(state.phase).toBe('recording');
    expect(state.startedAt).toBe(1000);
    expect(store.live(late + RECORD_STALE_MS)).not.toBeNull();
    expect(store.live(late + RECORD_STALE_MS + 1)).toBeNull();
  });

  it('★ 占着的那句话里有会话、时间和要录的是什么（另一场要看得懂是谁占的）', () => {
    const store = createRecordStore();
    const state = held(store.begin(pact('s1', 1000)));
    const text = recordOwnerText(state);

    expect(text).toContain('s1');
    expect(text).toContain('demo');
    expect(text).toContain('发布');
  });
});

describe('用户在左栏按的三个键：意图词表只此一份', () => {
  it('★ 认得出三个，其余一律 null（别把别的字当成指令）', () => {
    expect(parseRecordIntent('peek')).toBe('peek');
    expect(parseRecordIntent('halt')).toBe('halt');
    expect(parseRecordIntent('stop')).toBe('stop');
    for (const bad of ['', 'PEEK', 'Peek', 'cancel', 'kill', 'end', null, undefined, 1, {}, []]) {
      expect(parseRecordIntent(bad)).toBeNull();
    }
  });
});

describe('按计数落图的台账：落成才前进，失败如实记、同一个计数只重试一次', () => {
  const shot = (n: number, extra: Partial<RecordState['shots'][number]> = {}) => ({
    n,
    at: 1500 + n,
    path: `/w/diy/shots/rec-shot-demo-${String(n)}.png`,
    ...extra,
  });

  it('★ begin 时台账是空的（还没人按过「截图」）', () => {
    const store = createRecordStore();
    const state = held(store.begin(pact('s1', 1000)));

    expect(state.shots).toEqual([]);
    expect(state.shotsSeen).toBe(0);
    expect(state.shotTries).toBeNull();
  });

  it('★★ 落成一张 ⇒ 台账一条、shotsSeen 跟到那个计数、重试数清零', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));
    store.shotFailed('s1', shot(1, { error: '第一次没成' }), 1501);

    const state = held(store.shotTaken('s1', shot(1), 1502));

    expect(state.shots).toEqual([shot(1)]);
    expect(state.shotsSeen).toBe(1);
    expect(state.shotTries).toBeNull();
  });

  it('★★ 落失败 ⇒ 那一条带 error 原文、shotsSeen 一步不前进、同一个计数重试一次就试满了', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    const first = held(store.shotFailed('s1', shot(1, { error: 'opencli：截不下来' }), 1501));
    expect(first.shots).toEqual([shot(1, { error: 'opencli：截不下来' })]);
    expect(first.shotsSeen).toBe(0);
    expect(first.shotTries).toEqual({ n: 1, tries: 1 });

    const retried = held(store.shotFailed('s1', shot(1, { error: '还是截不下来' }), 1601));
    expect(retried.shots).toEqual([shot(1, { error: '还是截不下来' })]);
    expect(retried.shotTries).toEqual({ n: 1, tries: 2 });
  });

  it('★★ shotDueOf：没涨不拍 / 涨了才拍 / 试满两次就放下 / 他再按一下（计数换新）重来', () => {
    const store = createRecordStore();
    const state = held(store.begin(pact('s1', 1000)));

    expect(shotDueOf(state, 0)).toBeNull();
    expect(shotDueOf(state, 1)).toBe(1);
    expect(shotDueOf(state, 2.9)).toBe(2);
    expect(shotDueOf(state, Number.NaN)).toBeNull();

    const done = held(store.shotTaken('s1', shot(1), 1500));
    expect(shotDueOf(done, 1)).toBeNull();
    expect(shotDueOf(done, 2)).toBe(2);

    const failed = held(store.shotFailed('s1', shot(2, { error: '没成' }), 1501));
    expect(shotDueOf(failed, 2)).toBe(2);

    const tried = held(store.shotFailed('s1', shot(2, { error: '还是没成' }), 1502));
    expect(shotDueOf(tried, 2)).toBeNull();
    expect(shotDueOf(tried, 3)).toBe(3);
  });

  it('★ 台账按计数排好，且同一张只留最新那条（重试不叠行）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));
    store.shotTaken('s1', shot(2), 1500);
    store.shotFailed('s1', shot(1, { error: '没成' }), 1501);

    const state = held(store.shotFailed('s1', shot(1, { error: '重试也没成' }), 1502));

    expect(state.shots.map((one) => one.n)).toEqual([1, 2]);
    expect(state.shots).toHaveLength(2);
    expect(state.shots[0]?.error).toBe('重试也没成');
  });

  it('★ 台账不是谁都能写的：别人的会话 / 没有那一场，当场拒', () => {
    const store = createRecordStore();

    expect(store.shotTaken('s1', shot(1), 1000)).toEqual({ ok: false, code: 'none' });
    expect(store.shotFailed('s1', shot(1), 1000)).toEqual({ ok: false, code: 'none' });

    store.begin(pact('s1', 1000));
    expect(store.shotTaken('s2', shot(1), 1100)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.shotFailed('s2', shot(1), 1100)).toEqual({ ok: false, code: 'not-owner' });
    expect(store.live(1100)?.shots).toEqual([]);
  });
});

describe('门铃那一格：命中记一次，超时一个字不动', () => {
  it('★★ begin 时 0 次；命中一次 +1，并把这一次等了多少毫秒记下', () => {
    const store = createRecordStore();
    const state = held(store.begin(pact('s1', 1000)));

    expect(state.beats).toBe(0);
    expect(state.beatMs).toBe(0);

    const first = held(store.beat('s1', 42, 1200));
    expect(first.beats).toBe(1);
    expect(first.beatMs).toBe(42);
    expect(first.at).toBe(1200);

    const second = held(store.beat('s1', 7, 1300));
    expect(second.beats).toBe(2);
    expect(second.beatMs).toBe(7);
  });

  it('★★ 跟着相位走不丢（started / finished 都保留），收工连它一起清；别人的会话不许写', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));
    store.beat('s1', 12, 1100);
    store.started('s1', 2000, 2001);
    store.finished('s1', 3000, 3002);

    const live = store.live(3002);
    expect(live?.beats).toBe(1);
    expect(live?.beatMs).toBe(12);

    expect(store.beat('s2', 5, 3100)).toEqual({ ok: false, code: 'not-owner' });
    expect(held(store.beat('s1', 5, 3200)).beats).toBe(2);
    expect(store.stop('s1', 3300).ok).toBe(true);
    expect(store.live(3300)).toBeNull();
    expect(store.beat('s1', 5, 3400)).toEqual({ ok: false, code: 'none' });
  });

  it('★ 负数 / 小数收成正经毫秒（读侧那一行不出现 "-0 毫秒" 这种话）', () => {
    const store = createRecordStore();
    store.begin(pact('s1', 1000));

    expect(held(store.beat('s1', -3, 1100)).beatMs).toBe(0);
    expect(held(store.beat('s1', 4.7, 1200)).beatMs).toBe(4);
  });
});
