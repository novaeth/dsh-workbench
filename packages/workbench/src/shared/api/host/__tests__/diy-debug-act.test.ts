import { describe, expect, it } from 'vitest';
import { createDebugStore, type DebugPact } from '@dsh-workbench/shared/host';
import {
  debugActResource,
  debugNoticeText,
  deliverDebugNotice,
  holdNotice,
  noticeMessage,
  takeHeldNotices,
  type NoticeAgent,
  type NoticeMessage,
} from '../diy-debug-act';

const pact = (sessionId = 's1', now = 1000, unit = 'demo'): DebugPact => ({
  sessionId,
  workspacePath: '/w/workbench/diy',
  title: '工坊',
  board: '/w/workbench/diy',
  unit,
  name: unit,
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

describe('用户自己按的三个键：改状态 + 给 agent 一条 notice（不伪造用户消息）', () => {
  it('★★ 暂停（会话空着）：不叫醒 —— 挂进待投队列，等它下次活动再收到', () => {
    const { agent, sent } = agentOf('idle');
    const store = createDebugStore();
    store.begin(pact());
    const resource = debugActResource({ store: () => store, agents: () => ({ get: () => agent }), now: () => 2000 });

    const result = resource.handle({ intent: 'pause' }) as { ok: boolean; delivered?: string };

    expect(result.ok).toBe(true);
    expect(result.delivered).toBe('held');
    expect(store.live(2000)?.phase).toBe('paused');
    expect(sent).toHaveLength(0);
    const queued = takeHeldNotices('s1');
    expect(queued).toHaveLength(1);
    const message = queued[0] as NoticeMessage;
    expect(message.role).toBe('user');
    expect(message.source.kind).toBe('workbench-diy');
    expect(message.source.form).toBe('notice');
    expect(message.source.summary).toContain('用户按了暂停');
    expect(message.content[0]?.text).toContain('别再把那一屏当目标');
    expect(takeHeldNotices('s1')).toHaveLength(0);
  });

  it('★★ 继续（会话空着）：**要唤醒**（叫醒它接着看屏）', () => {
    const { agent, sent } = agentOf('idle');
    const store = createDebugStore();
    store.begin(pact());
    const resource = debugActResource({ store: () => store, agents: () => ({ get: () => agent }), now: () => 2000 });
    resource.handle({ intent: 'pause' });

    const resumed = resource.handle({ intent: 'resume' }) as { delivered?: string };

    expect(resumed.delivered).toBe('followup');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[0]).toBe('followup');
    expect(takeHeldNotices('s1')).toHaveLength(1);
  });

  it('★★ 结束（会话空着）：一条都不发', async () => {
    const { agent, sent } = agentOf('idle');
    const store = createDebugStore();
    store.begin(pact());
    const resource = debugActResource({ store: () => store, agents: () => ({ get: () => agent }), now: () => 2000 });

    const stopped = (await resource.handle({ intent: 'stop' })) as { delivered?: string };

    expect(stopped.delivered).toBe('skipped-idle');
    expect(store.live(2000)).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('★★ 会话没在跑（拿不到 agent）：暂停先挂起来，结束不发', async () => {
    const pauseStore = createDebugStore();
    pauseStore.begin(pact());
    const pause = debugActResource({ store: () => pauseStore, agents: () => undefined, now: () => 2000 });
    expect((pause.handle({ intent: 'pause' }) as { delivered?: string }).delivered).toBe('held');
    expect(takeHeldNotices('s1')).toHaveLength(1);

    const stopStore = createDebugStore();
    stopStore.begin(pact());
    const stop = debugActResource({ store: () => stopStore, agents: () => undefined, now: () => 2000 });
    expect(((await stop.handle({ intent: 'stop' })) as { delivered?: string }).delivered).toBe('none');
    expect(takeHeldNotices('s1')).toHaveLength(0);
  });

  it('★★ 结束要等"收观察"那一拍落地（用户按的结束也不能漏收）；暂停 / 继续不等', async () => {
    const settledCalls: string[] = [];
    const base = createDebugStore();
    base.begin(pact());
    const store = {
      ...base,
      settle: async (): Promise<void> => {
        settledCalls.push('settle');
      },
    };
    const { agent } = agentOf('running');
    const resource = debugActResource({ store: () => store, agents: () => ({ get: () => agent }), now: () => 2000 });

    await resource.handle({ intent: 'pause' });
    expect(settledCalls).toEqual([]);

    await resource.handle({ intent: 'stop' });
    expect(settledCalls).toEqual(['settle']);
  });

  it('★ agent 正跑着：三种都直接 inject（下一步带上），不打断也不挂队', async () => {
    for (const intent of ['pause', 'resume', 'stop'] as const) {
      const { agent, sent } = agentOf('running');
      const store = createDebugStore();
      store.begin(pact());
      if (intent === 'resume') store.pause('s1', 2000);
      const resource = debugActResource({ store: () => store, agents: () => ({ get: () => agent }), now: () => 2000 });

      const result = (await resource.handle({ intent })) as { delivered?: string };

      expect(result.delivered).toBe('inject');
      expect(sent).toHaveLength(1);
      expect(sent[0]?.[0]).toBe('inject');
      expect(takeHeldNotices('s1')).toHaveLength(0);
    }
  });

  it('★★ 按不动就说清为什么，而且一条消息都不投、也不挂队', () => {
    const { agent, sent } = agentOf('idle');
    const store = createDebugStore();
    const resource = debugActResource({ store: () => store, agents: () => ({ get: () => agent }), now: () => 2000 });

    expect(resource.handle({ intent: 'pause' })).toEqual({
      ok: false,
      text: '现在没有调试态 —— 没什么可暂停 / 继续 / 结束的',
    });
    expect(resource.handle({ intent: '爆炸' })).toEqual({
      ok: false,
      text: '不认识的意图（只认 pause / resume / stop）',
    });

    store.begin(pact());
    store.pause('s1', 2000);
    const again = resource.handle({ intent: 'pause' }) as { ok: boolean; text?: string };
    expect(again.ok).toBe(false);
    expect(again.text).toBe('这一场已经是暂停态了');
    expect(sent).toHaveLength(0);
    expect(takeHeldNotices('s1')).toHaveLength(0);
  });

  it('★★ 三句通知正文都交底：现在什么状态、接下来怎么办', () => {
    const store = createDebugStore();
    const move = store.begin(pact());
    expect(move.ok).toBe(true);
    if (!move.ok) return;
    const state = move.state;

    expect(debugNoticeText('pause', state)).toContain('等用户按「继续」');
    expect(debugNoticeText('resume', state)).toContain('重新开始');
    expect(debugNoticeText('stop', state)).toContain('收工');
    for (const text of [
      debugNoticeText('pause', state),
      debugNoticeText('resume', state),
      debugNoticeText('stop', state),
    ]) {
      expect(text).toContain('［调试 · 工坊］');
    }
  });

  it('★ 投递本身是纯的：三种模式 × 空着 / 忙着 / 没会话 各归各位', () => {
    const idle = agentOf('idle');
    const busy = agentOf('busy');
    const first = noticeMessage('一', '一');
    const second = noticeMessage('二', '二');
    const third = noticeMessage('三', '三');

    expect(deliverDebugNotice(undefined, 'cold', noticeMessage('冷', '冷'), 'drop')).toBe('none');
    expect(deliverDebugNotice(undefined, 'cold', noticeMessage('冷', '冷'), 'hold')).toBe('held');
    expect(deliverDebugNotice({ get: () => idle.agent }, 's1', first, 'wake')).toBe('followup');
    expect(deliverDebugNotice({ get: () => busy.agent }, 's1', second, 'hold')).toBe('inject');
    expect(deliverDebugNotice({ get: () => idle.agent }, 's2', third, 'drop')).toBe('skipped-idle');
    expect(idle.sent).toEqual([['followup', first]]);
    expect(busy.sent).toEqual([['inject', second]]);
    expect(takeHeldNotices('cold')).toHaveLength(1);
  });

  it('★★ 裸字符串当场拒（dsh 只要 UserMessage 形状；一条字符串进去就把这场会话写坏）', () => {
    const { agent, sent } = agentOf('idle');

    expect(() => deliverDebugNotice({ get: () => agent }, 's1', '他按了「结束录制」' as never, 'wake')).toThrow(
      'UserMessage 形状',
    );
    expect(() => holdNotice('s1', '他按了「结束录制」' as never)).toThrow('UserMessage 形状');
    expect(sent).toHaveLength(0);
    expect(takeHeldNotices('s1')).toHaveLength(0);

    const good = noticeMessage('他按了「结束录制」', '工作台 DIY：他按了「结束录制」');
    expect(deliverDebugNotice({ get: () => agent }, 's1', good, 'wake')).toBe('followup');
    expect(sent).toEqual([['followup', good]]);
  });
});
