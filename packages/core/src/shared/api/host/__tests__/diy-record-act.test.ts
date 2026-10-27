import { describe, expect, it } from 'vitest';
import { createRecordStore, parseRecordIntent, type RecordPact } from '@dsh-workbench/shared/host';
import { recordActResource, recordNoticeText } from '../diy-record-act';
import { takeHeldNotices, type NoticeAgent, type NoticeMessage } from '../diy-debug-act';

const pact = (sessionId = 's1', now = 1000, unit = 'inventory'): RecordPact => ({
  sessionId,
  workspace: '/w/workbench/diy',
  unit,
  name: unit,
  url: 'https://inventory.example.com/env',
  title: '',
  action: '发布',
  expect: null,
  captureFile: '/w/workbench/diy/shots/rec-inventory.jsonl',
  now,
});

function agentOf(status = 'idle'): { agent: NoticeAgent; sent: Array<[string, NoticeMessage]> } {
  const sent: Array<[string, NoticeMessage]> = [];
  return {
    sent,
    agent: {
      status,
      inject: (message) => sent.push(['inject', message]),
      followup: (message) => sent.push(['followup', message]),
    },
  };
}

describe('用户自己按的三个键：给 agent 一条 notice，状态那一半按意图分工', () => {
  it('★ 意图词表只此一份（认不出就当场说清）', () => {
    expect(parseRecordIntent('peek')).toBe('peek');
    expect(parseRecordIntent('halt')).toBe('halt');
    expect(parseRecordIntent('stop')).toBe('stop');
    expect(parseRecordIntent('cancel')).toBeNull();

    const resource = recordActResource({ store: () => createRecordStore(), agents: () => undefined });
    return Promise.resolve(resource.handle({ intent: 'cancel' })).then((out) => {
      expect(out).toMatchObject({ ok: false });
    });
  });

  it('★★ 收工那一拍：释放抛了也必须把状态清掉（不然谁都开不了下一场，白等 15 分钟）', async () => {
    const { agent, sent } = agentOf('idle');
    const store = {
      ...createRecordStore(),
      release: () => Promise.reject(new Error('opencli 那条命令炸了')),
    };
    store.begin(pact());
    store.started('s1', 1000, 1000);
    store.finished('s1', 2000, 2000);
    const resource = recordActResource({
      store: () => store,
      agents: () => ({ get: () => agent }),
      now: () => 3000,
    });

    const result = (await resource.handle({ intent: 'stop' })) as {
      ok: boolean;
      cleaned?: { readonly tab: boolean; readonly capture: boolean };
    };

    expect(result.ok).toBe(true);
    expect(result.cleaned).toEqual({ tab: false, capture: false });
    expect(store.live(Date.now())).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('★ 没有那一场 ⇒ 拒（没什么可停的），一条命令都不发', async () => {
    const resource = recordActResource({ store: () => createRecordStore(), agents: () => undefined });

    expect(await resource.handle({ intent: 'stop' })).toMatchObject({ ok: false });
  });

  it('★★ 「看结果」：会话空着就**叫醒它**（用户正等着那一段），且不动状态', async () => {
    const { agent, sent } = agentOf('idle');
    const store = createRecordStore();
    store.begin(pact());
    store.started('s1', 1000, 1000);
    store.finished('s1', 2000, 2000);
    const resource = recordActResource({ store: () => store, agents: () => ({ get: () => agent }), now: () => 3000 });

    const result = (await resource.handle({ intent: 'peek' })) as { ok: boolean; delivered?: string };

    expect(result.ok).toBe(true);
    expect(result.delivered).toBe('followup');
    expect(store.live(3000)?.phase).toBe('finished');
    expect(sent.map(([kind]) => kind)).toEqual(['followup']);
    const message = sent[0]?.[1] as NoticeMessage;
    expect(message.role).toBe('user');
    expect(message.source.kind).toBe('workbench-diy-record');
    expect(message.source.form).toBe('notice');
    expect(message.source.summary).toContain('用户按了看结果');
    expect(message.content[0]?.text).toContain('workbench_diy_record_read');
    expect(takeHeldNotices('s1')).toHaveLength(0);
  });

  it('★ 会话不在（没有 agent）⇒ 挂进待投队列，等它下次活动再收到', async () => {
    const store = createRecordStore();
    store.begin(pact());
    const resource = recordActResource({ store: () => store, agents: () => undefined, now: () => 3000 });

    const result = (await resource.handle({ intent: 'peek' })) as { ok: boolean; delivered?: string };

    expect(result.delivered).toBe('held');
    expect(takeHeldNotices('s1')).toHaveLength(1);
  });

  it('★★ 「停」：会话空着也唤（他等着），话里钉死"先 read 再 stop"', async () => {
    const { agent, sent } = agentOf('idle');
    const store = createRecordStore();
    store.begin(pact());
    store.started('s1', 1000, 1000);
    const resource = recordActResource({ store: () => store, agents: () => ({ get: () => agent }), now: () => 2000 });

    const result = (await resource.handle({ intent: 'halt' })) as { ok: boolean; delivered?: string };

    expect(result.ok).toBe(true);
    expect(result.delivered).toBe('followup');
    expect(sent.map(([kind]) => kind)).toEqual(['followup']);
    expect(store.live(2000)?.phase).toBe('recording');
    expect(String(sent[0]?.[1]['content'][0]['text'])).toContain('先 read 再 stop');
  });

  it('★★ 「收工」：真的释放（停捕获 + 收标签）再清状态，且回执里带上释放结果', async () => {
    const { agent, sent } = agentOf('idle');
    const store = createRecordStore();
    store.begin(pact());
    const released: string[] = [];
    const withRelease = {
      ...store,
      release: async (state: { unit: string }) => {
        released.push(state.unit);
        return { tab: true, capture: true };
      },
    };
    const resource = recordActResource({
      store: () => withRelease,
      agents: () => ({ get: () => agent }),
      now: () => 4000,
    });

    const result = (await resource.handle({ intent: 'stop' })) as {
      ok: boolean;
      delivered?: string;
      cleaned?: { tab: boolean; capture: boolean };
      state: unknown;
    };

    expect(result.ok).toBe(true);
    expect(released).toEqual(['inventory']);
    expect(result.cleaned).toEqual({ tab: true, capture: true });
    expect(result.state).toBeNull();
    expect(store.live(4000)).toBeNull();
    expect(sent).toHaveLength(0);
    expect(
      String(
        recordNoticeText('stop', {
          ...pact(),
          phase: 'armed',
          at: 1,
          startedAt: 1,
          t0: null,
          t1: null,
          shots: [],
          shotsSeen: 0,
          shotTries: null,
          beats: 0,
          beatMs: 0,
        }),
      ),
    ).toContain('这一场收了');
  });
});
