import { describe, expect, it } from 'vitest';
import type {
  SessionStatus,
  SessionStatusSnapshot,
  SessionSummary,
  SessionsSnapshot,
  WorkspaceView,
} from '@dsh-workbench/shared';
import {
  attentionOf,
  attentionOfSession,
  attentionSessionIdOf,
  longTaskPresenceOf,
  type LongTaskPresence,
} from '../attention';

function workspace(id: string, sessionIds: readonly string[]): WorkspaceView {
  return { workspaceId: id, path: `/w/${id}`, title: id, sessionIds, createdAt: 1, updatedAt: 1 };
}

function summary(id: string, patch: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    displayTitle: id,
    blank: false,
    running: false,
    updatedAt: 1_700_000_000_000,
    retainedBy: {},
    ...patch,
  };
}

function snapshot(rows: readonly SessionSummary[]): SessionsSnapshot {
  const byId: Record<string, SessionSummary> = {};
  for (const row of rows) byId[row.id] = row;
  return { byId, projectionsBySession: {} };
}

function statuses(entries: Array<[string, SessionStatus]>): SessionStatusSnapshot {
  return new Map(entries);
}

const ARCHIVED_NONE: ReadonlySet<string> = new Set();

describe('长任务在跑（左栏会话行与项目下拉里那颗 loading 点）', () => {
  const PRESENCE = (sessions: readonly string[], workspaces: Array<[string, number]>): LongTaskPresence => ({
    bySession: new Set(sessions),
    byWorkspace: new Map(workspaces),
  });

  it('★★ longTaskPresenceOf：有会话可归的进 bySession，每一条都按工作区数进 byWorkspace', () => {
    const presence = longTaskPresenceOf([
      { workspace: '/w/wa', session: 'a1' },
      { workspace: '/w/wa' },
      { workspace: '/w/wb', session: 'b1' },
    ]);

    expect([...presence.bySession].sort()).toEqual(['a1', 'b1']);
    expect([...presence.byWorkspace]).toEqual([
      ['/w/wa', 2],
      ['/w/wb', 1],
    ]);
    expect(longTaskPresenceOf([])).toEqual({ bySession: new Set(), byWorkspace: new Map() });
  });

  it('★ 会话自己那一档：这条会话起的某趟长任务还在跑 ⇒ 它就是 ongoing（它那一轮可能早结束了）', () => {
    const list = snapshot([summary('a')]);

    expect(
      attentionOfSession(list.byId.a as SessionSummary, statuses([]), list, new Set(['a'])),
    ).toBe('ongoing');
    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([]), list)).toBeUndefined();
  });

  it('★ 会话自己起的长任务：工作区那颗点是 ongoing、计数是**会话**数，那句话照旧说会话', () => {
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1', 'a2'])],
      sessions: snapshot([summary('a1'), summary('a2')]),
      statusById: statuses([]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
      longTasks: PRESENCE(['a1'], [['/w/wa', 1]]),
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'ongoing', count: 1 });
    expect(attention.elsewhere).toBeNull();
    expect(attention.overall).toBeNull();
  });

  it('★★ 没有会话可归的那趟（用户在面板上按的）：计数是**长任务**条数，并且点名叫它', () => {
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1'])],
      sessions: snapshot([summary('a1')]),
      statusById: statuses([]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
      longTasks: PRESENCE([], [['/w/wa', 2]]),
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'ongoing', count: 2, longTask: true });
  });

  it('★ 档序照旧：这一格里有"跑完没看"时，长任务在跑不许把它顶掉（在跑是最低那档）', () => {
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1'])],
      sessions: snapshot([summary('a1')]),
      statusById: statuses([['a1', { completionUnread: true }]]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
      longTasks: PRESENCE([], [['/w/wa', 1]]),
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'done', count: 1 });
    expect(attention.overall).toEqual({ severity: 'done', count: 1 });
    expect(attention.elsewhere).toBeNull();
  });

  it('★ 长任务只在它自己那个工作区那一行亮：别的工作区不受影响', () => {
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1']), workspace('wb', ['b1'])],
      sessions: snapshot([summary('a1'), summary('b1')]),
      statusById: statuses([]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
      longTasks: PRESENCE([], [['/w/wb', 1]]),
    });

    expect(attention.byWorkspace.get('wa')).toBeUndefined();
    expect(attention.byWorkspace.get('wb')).toEqual({ severity: 'ongoing', count: 1, longTask: true });
  });

  it('★ 切工作区：只有长任务在跑的那条会话也挑得到（同档按最近更新）', () => {
    const sessions = snapshot([summary('busy', { updatedAt: 3 }), summary('idle-newest', { updatedAt: 9 })]);

    expect(
      attentionSessionIdOf({
        workspace: workspace('wa', ['busy', 'idle-newest']),
        sessions,
        statusById: statuses([]),
        archivedIds: ARCHIVED_NONE,
        longTasks: PRESENCE(['busy'], [['/w/wa', 1]]),
      }),
    ).toBe('busy');
  });
});
