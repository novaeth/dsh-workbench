import { describe, expect, it } from 'vitest';
import type {
  SessionStatus,
  SessionStatusSnapshot,
  SessionSummary,
  SessionsSnapshot,
  Translate,
  WorkspaceView,
} from '@dsh-workbench/shared';
import {
  attentionLabel,
  attentionOf,
  attentionOfSession,
  attentionSessionIdOf,
  attentionWordLabel,
  longTaskPresenceOf,
  type LongTaskPresence,
  type WorkspaceAttention,
} from '../attention';

const t: Translate = (key, params) =>
  params === undefined ? key : `${key}:${String(params.n ?? '')}`;

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
  const PRESENCE = (
    sessions: readonly string[],
    workspaces: Array<[string, number]>,
    waitingSessions: readonly string[] = [],
    waitingWorkspaces: Array<[string, number]> = [],
  ): LongTaskPresence => ({
    bySession: new Set(sessions),
    byWorkspace: new Map(workspaces),
    waitingBySession: new Set(waitingSessions),
    waitingByWorkspace: new Map(waitingWorkspaces),
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
    expect(longTaskPresenceOf([])).toEqual({
      bySession: new Set(),
      byWorkspace: new Map(),
      waitingBySession: new Set(),
      waitingByWorkspace: new Map(),
    });
  });

  it('★★ longTaskPresenceOf：needs-human / needs-login 另进 waiting 两格，running / ok 不算等人', () => {
    const presence = longTaskPresenceOf([
      { workspace: '/w/wa', session: 'a1', status: 'needs-human' },
      { workspace: '/w/wa', session: 'a2', status: 'running' },
      { workspace: '/w/wa', status: 'needs-login' },
      { workspace: '/w/wb', session: 'b1', status: 'ok' },
    ]);

    expect([...presence.waitingBySession]).toEqual(['a1']);
    expect([...presence.waitingByWorkspace]).toEqual([['/w/wa', 2]]);
    expect([...presence.byWorkspace]).toEqual([
      ['/w/wa', 3],
      ['/w/wb', 1],
    ]);
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

  it('★★ 停在等人的会话：自己那档是 warning，压过 running / longTask / done', () => {
    const list = snapshot([summary('a', { running: true })]);

    expect(
      attentionOfSession(list.byId.a as SessionSummary, statuses([['a', { completionUnread: true }]]), list, new Set(['a']), new Set(['a'])),
    ).toBe('warning');
    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([]), list, new Set(), new Set(['a']))).toBe(
      'warning',
    );
    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([]), list, new Set(['a']), new Set())).toBe(
      'ongoing',
    );
  });

  it('★★ 工作区有等人长任务 ⇒ 档位至少 warning：计数是待人条数、点名叫长任务在等你处理', () => {
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1'])],
      sessions: snapshot([summary('a1')]),
      statusById: statuses([['a1', { completionUnread: true }]]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
      longTasks: PRESENCE([], [['/w/wa', 2]], [], [['/w/wa', 1]]),
    });

    const own = attention.byWorkspace.get('wa');
    expect(own).toEqual({ severity: 'warning', count: 1, longTask: true, longTaskWaiting: true });
    expect(attention.elsewhere).toBeNull();
    expect(attention.overall).toEqual({ severity: 'warning', count: 1, longTask: true, longTaskWaiting: true });
    expect(attentionLabel(own as WorkspaceAttention, t)).toBe('project.attention.longTaskWaiting.one:1');
    expect(attentionWordLabel(own as WorkspaceAttention, t)).toBe('project.attention.state.longTaskWaiting');
  });

  it('★★ 两个工作区都在等人：overall 合并后仍说「长任务在等你处理」，不回落成通用 warning', () => {
    const attention = attentionOf({
      workspaces: [workspace('wa', []), workspace('wb', [])],
      sessions: snapshot([]),
      statusById: statuses([]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
      longTasks: PRESENCE(
        [],
        [
          ['/w/wa', 1],
          ['/w/wb', 1],
        ],
        [],
        [
          ['/w/wa', 1],
          ['/w/wb', 1],
        ],
      ),
    });

    expect(attention.overall).toEqual({
      severity: 'warning',
      count: 2,
      longTask: true,
      longTaskWaiting: true,
    });
    expect(attentionLabel(attention.overall as WorkspaceAttention, t)).toBe(
      'project.attention.longTaskWaiting.other:2',
    );
    expect(attention.elsewhere).toEqual({
      severity: 'warning',
      count: 1,
      longTask: true,
      longTaskWaiting: true,
    });
  });

  it('★★ 同一格既有待审批会话又有等人长任务：文案优先说长任务，count 是待人 run 数', () => {
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1', 'a2'])],
      sessions: snapshot([summary('a1'), summary('a2')]),
      statusById: statuses([
        ['a1', { pendingInteraction: { kind: 'approval' } }],
        ['a2', { pendingInteraction: { kind: 'question' } }],
      ]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
      longTasks: PRESENCE([], [['/w/wa', 3]], [], [['/w/wa', 2]]),
    });

    const own = attention.byWorkspace.get('wa');
    expect(own).toEqual({ severity: 'warning', count: 2, longTask: true, longTaskWaiting: true });
    expect(attention.elsewhere).toEqual(own);
    expect(attentionLabel(own as WorkspaceAttention, t)).toBe('project.attention.longTaskWaiting.other:2');
  });

  it('★★ 等人只在它自己那个工作区亮；「在跑」那条旧规则不受影响（没有等人时仍是 ongoing）', () => {
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1']), workspace('wb', ['b1'])],
      sessions: snapshot([summary('a1'), summary('b1')]),
      statusById: statuses([]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
      longTasks: PRESENCE([], [['/w/wa', 1], ['/w/wb', 1]], [], [['/w/wb', 1]]),
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'ongoing', count: 1, longTask: true });
    expect(attention.byWorkspace.get('wb')).toEqual({
      severity: 'warning',
      count: 1,
      longTask: true,
      longTaskWaiting: true,
    });
    expect(attention.elsewhere).toEqual({
      severity: 'warning',
      count: 1,
      longTask: true,
      longTaskWaiting: true,
    });
  });

  it('★★ 切工作区：停在等人的那条会话挑得到（warning 压过 done 与在跑）', () => {
    const sessions = snapshot([
      summary('wait', { updatedAt: 1 }),
      summary('done', { updatedAt: 9 }),
      summary('run', { updatedAt: 8 }),
    ]);

    expect(
      attentionSessionIdOf({
        workspace: workspace('wa', ['wait', 'done', 'run']),
        sessions,
        statusById: statuses([
          ['done', { completionUnread: true }],
          ['run', { running: true }],
        ]),
        archivedIds: ARCHIVED_NONE,
        longTasks: PRESENCE([], [], ['wait'], [['/w/wa', 1]]),
      }),
    ).toBe('wait');
  });
});
