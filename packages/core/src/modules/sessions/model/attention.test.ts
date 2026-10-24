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
} from './attention';

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

function snapshot(
  rows: readonly SessionSummary[],
  subagents: Record<string, readonly string[]> = {},
): SessionsSnapshot {
  const byId: Record<string, SessionSummary> = {};
  for (const row of rows) byId[row.id] = row;
  const projections: Record<string, { values?: { subagentCatalog?: Array<{ id: string }> } }> = {};
  for (const [sessionId, children] of Object.entries(subagents)) {
    projections[sessionId] = { values: { subagentCatalog: children.map((id) => ({ id })) } };
  }
  return { byId, projectionsBySession: projections };
}

function statuses(entries: Array<[string, SessionStatus]>): SessionStatusSnapshot {
  return new Map(entries);
}

const ARCHIVED_NONE: ReadonlySet<string> = new Set();

describe('attentionOfSession', () => {
  it('★ 待交互只认那三类可见 kind：别的 kind 不算 warning（与行上的点同口径）', () => {
    const list = snapshot([summary('a')]);

    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([['a', { pendingInteraction: { kind: 'approval' } }]]), list)).toBe('warning');
    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([['a', { pendingInteraction: { kind: 'question' } }]]), list)).toBe('warning');
    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([['a', { pendingInteraction: { kind: 'other' } }]]), list)).toBeUndefined();
  });

  it('★ 三档按 warning > ongoing > done 取第一个占上的', () => {
    const list = snapshot([summary('a')]);

    expect(
      attentionOfSession(
        list.byId.a as SessionSummary,
        statuses([['a', { running: true, completionUnread: true, pendingInteraction: { kind: 'approval' } }]]),
        list,
      ),
    ).toBe('warning');
    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([['a', { running: true, completionUnread: true }]]), list)).toBe('ongoing');
    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([['a', { running: false, completionUnread: true }]]), list)).toBe('done');
    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([['a', { running: false, completionUnread: false }]]), list)).toBeUndefined();
  });

  it('状态表里没有这条时，回退会话自己的 running', () => {
    const list = snapshot([summary('a', { running: true })]);

    expect(attentionOfSession(list.byId.a as SessionSummary, new Map(), list)).toBe('ongoing');
  });

  it('★ 父会话自己停了、子代理还在跑 ⇒ 也算在跑（工作区那级不能漏了这一档）', () => {
    const list = snapshot(
      [summary('a'), summary('child')],
      { a: ['child'] },
    );

    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([['child', { running: true }]]), list)).toBe('ongoing');
  });

  it('★ 子代理也停了 ⇒ 父会话就是没在跑（回落到 done / 无）', () => {
    const list = snapshot([summary('a'), summary('child')], { a: ['child'] });

    expect(attentionOfSession(list.byId.a as SessionSummary, statuses([['child', { running: false }]]), list)).toBeUndefined();
    expect(
      attentionOfSession(list.byId.a as SessionSummary, statuses([['a', { completionUnread: true }], ['child', { running: false }]]), list),
    ).toBe('done');
  });
});

describe('attentionOf', () => {
  const wa = workspace('wa', ['a1', 'a2']);
  const wb = workspace('wb', ['b1']);
  const wc = workspace('wc', ['c1', 'c2']);

  it('★ 当前工作区进 byWorkspace（它那一行要点），但不进 elsewhere（触发器说的是「别处」）；overall 两头都算', () => {
    const sessions = snapshot([summary('a1'), summary('b1')]);
    const attention = attentionOf({
      workspaces: [wa, wb],
      sessions,
      statusById: statuses([
        ['a1', { pendingInteraction: { kind: 'approval' } }],
        ['b1', { completionUnread: true }],
      ]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'warning', count: 1 });
    expect(attention.elsewhere).toEqual({ severity: 'done', count: 1 });
    expect(attention.overall).toEqual({ severity: 'warning', count: 1 });
  });

  it('★ 折叠态那份 `overall` 含当前工作区，但**跟 elsewhere 一样排除在跑**（用户：和展开态保持逻辑一致）', () => {
    const sessions = snapshot([summary('a1')]);
    const running = attentionOf({
      workspaces: [workspace('wa', ['a1'])],
      sessions,
      statusById: statuses([['a1', { running: true }]]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
    });

    expect(running.elsewhere).toBeNull();
    expect(running.overall).toBeNull();
    expect(running.byWorkspace.get('wa')).toEqual({ severity: 'ongoing', count: 1 });

    const waiting = attentionOf({
      workspaces: [workspace('wa', ['a1'])],
      sessions,
      statusById: statuses([['a1', { pendingInteraction: { kind: 'approval' } }]]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
    });

    expect(waiting.elsewhere).toBeNull();
    expect(waiting.overall).toEqual({ severity: 'warning', count: 1 });
  });

  it('★ 一个工作区一颗点：取最严重的那一档，计数是**那一档**的条数（别把在跑的算进"等你点头"）', () => {
    const sessions = snapshot([summary('a1'), summary('a2'), summary('a3')]);
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1', 'a2', 'a3'])],
      sessions,
      statusById: statuses([
        ['a1', { running: true }],
        ['a2', { running: true }],
        ['a3', { pendingInteraction: { kind: 'plan-review' } }],
      ]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'warning', count: 1 });
    expect(attention.elsewhere).toEqual({ severity: 'warning', count: 1 });
  });

  it('★ 档序是 warning > done > ongoing：在跑最低（用户口径：loading 最不该叫人）', () => {
    const sessions = snapshot([summary('a1'), summary('a2')]);
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1', 'a2'])],
      sessions,
      statusById: statuses([
        ['a1', { running: true }],
        ['a2', { running: false, completionUnread: true }],
      ]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'done', count: 1 });
    expect(attention.overall).toEqual({ severity: 'done', count: 1 });
  });

  it('★ 只有"在跑"才轮到它（那时它就是这一格里唯一的信号）', () => {
    const sessions = snapshot([summary('a1'), summary('a2')]);
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1', 'a2'])],
      sessions,
      statusById: statuses([
        ['a1', { running: true }],
        ['a2', { running: true }],
      ]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'ongoing', count: 2 });
    expect(attention.overall).toBeNull();
  });

  it('★ 只有子代理在跑也算"这个工作区在跑"（父会话那一行要点）', () => {
    const sessions = snapshot([summary('a1'), summary('child')], { a1: ['child'] });
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1'])],
      sessions,
      statusById: statuses([['child', { running: true }]]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'ongoing', count: 1 });
    expect(attention.elsewhere).toBeNull();
    expect(attention.overall).toBeNull();
  });

  it('★ 同一个工作区两条同档 ⇒ 计数 2（那一档自己的条数）', () => {
    const sessions = snapshot([summary('a1'), summary('a2')]);
    const attention = attentionOf({
      workspaces: [workspace('wa', ['a1', 'a2'])],
      sessions,
      statusById: statuses([
        ['a1', { pendingInteraction: { kind: 'approval' } }],
        ['a2', { pendingInteraction: { kind: 'question' } }],
      ]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'warning', count: 2 });
    expect(attention.elsewhere).toEqual({ severity: 'warning', count: 2 });
  });

  it('★ 同档跨工作区相加：两个工作区各有一条"跑完没看" ⇒ 2', () => {
    const sessions = snapshot([summary('b1'), summary('c1')]);
    const attention = attentionOf({
      workspaces: [wb, wc],
      sessions,
      statusById: statuses([
        ['b1', { completionUnread: true }],
        ['c1', { completionUnread: true }],
      ]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
    });

    expect(attention.elsewhere).toEqual({ severity: 'done', count: 2 });
    expect([...attention.byWorkspace.keys()]).toEqual(['wb', 'wc']);
  });

  it('★ 更重的那一档压过先出现的档（先 done 后 warning ⇒ warning）', () => {
    const sessions = snapshot([summary('b1'), summary('c1')]);
    const attention = attentionOf({
      workspaces: [wb, wc],
      sessions,
      statusById: statuses([
        ['b1', { completionUnread: true }],
        ['c1', { pendingInteraction: { kind: 'approval' } }],
      ]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
    });

    expect(attention.elsewhere).toEqual({ severity: 'warning', count: 1 });
  });

  it('★ 先 warning 后 done ⇒ 还是 warning，计数不把 done 加进来', () => {
    const sessions = snapshot([summary('b1'), summary('c1')]);
    const attention = attentionOf({
      workspaces: [wb, wc],
      sessions,
      statusById: statuses([
        ['b1', { pendingInteraction: { kind: 'approval' } }],
        ['c1', { completionUnread: true }],
      ]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
    });

    expect(attention.elsewhere).toEqual({ severity: 'warning', count: 1 });
  });

  it('★ 只有"在跑"时触发器不打标签（`elsewhere === null`），但菜单行那颗点还在', () => {
    const sessions = snapshot([summary('b1'), summary('c1')]);
    const attention = attentionOf({
      workspaces: [wb, wc],
      sessions,
      statusById: statuses([
        ['b1', { running: true }],
        ['c1', { running: true }],
      ]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
    });

    expect(attention.elsewhere).toBeNull();
    expect(attention.byWorkspace.get('wb')).toEqual({ severity: 'ongoing', count: 1 });
    expect(attention.byWorkspace.get('wc')).toEqual({ severity: 'ongoing', count: 1 });
  });

  it('★ 子代理会话自己不占行：算在父会话那一格里（不重复计数），归档会话也不算', () => {
    const sessions = snapshot(
      [summary('a1'), summary('child', { origin: 'subagent', running: true }), summary('a2')],
      { a1: ['child'] },
    );
    const attention = attentionOf({
      workspaces: [wa],
      sessions,
      statusById: statuses([['a2', { completionUnread: true }]]),
      archivedIds: new Set(['a2']),
      currentWorkspaceId: null,
    });

    expect(attention.byWorkspace.get('wa')).toEqual({ severity: 'ongoing', count: 1 });
    expect(attention.elsewhere).toBeNull();
    expect(attention.overall).toBeNull();
  });

  it('全 idle ⇒ 一个点都没有（触发器不打标签、菜单行也不顶掉图标）', () => {
    const sessions = snapshot([summary('a1'), summary('b1')]);
    const attention = attentionOf({
      workspaces: [wa, wb],
      sessions,
      statusById: new Map(),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: 'wa',
    });

    expect(attention.elsewhere).toBeNull();
    expect(attention.byWorkspace.size).toBe(0);
  });

  it('当前工作区 id 为 null 时，每个工作区都算「别处」', () => {
    const sessions = snapshot([summary('a1')]);
    const attention = attentionOf({
      workspaces: [wa],
      sessions,
      statusById: statuses([['a1', { completionUnread: true }]]),
      archivedIds: ARCHIVED_NONE,
      currentWorkspaceId: null,
    });

    expect(attention.elsewhere).toEqual({ severity: 'done', count: 1 });
  });
});

describe('attentionSessionIdOf（切工作区落到哪条会话）', () => {
  it('★ 档序 warning > done > ongoing：在跑挑得到、压不过前两档；归档与子代理不算', () => {
    const sessions = snapshot([
      summary('run', { updatedAt: 9 }),
      summary('done', { updatedAt: 8 }),
      summary('wait', { updatedAt: 7 }),
      summary('archived', { updatedAt: 10 }),
      summary('child', { origin: 'subagent', running: true, updatedAt: 11 }),
    ]);
    const statusById = statuses([
      ['run', { running: true }],
      ['done', { completionUnread: true }],
      ['wait', { pendingInteraction: { kind: 'approval' } }],
      ['archived', { completionUnread: true }],
      ['child', { running: true }],
    ]);

    expect(
      attentionSessionIdOf({
        workspace: workspace('wa', ['run', 'done', 'wait', 'archived', 'child']),
        sessions,
        statusById,
        archivedIds: new Set(['archived']),
      }),
    ).toBe('wait');
  });

  it('★ 只有跑完没看时挑那条（在跑最低、抢不过它），同档按最近更新、再按 id', () => {
    const sessions = snapshot([
      summary('running', { updatedAt: 20 }),
      summary('older', { updatedAt: 5 }),
      summary('newer', { updatedAt: 6 }),
    ]);
    const statusById = statuses([
      ['running', { running: true }],
      ['older', { completionUnread: true }],
      ['newer', { completionUnread: true }],
    ]);

    expect(
      attentionSessionIdOf({
        workspace: workspace('wa', ['running', 'older', 'newer']),
        sessions,
        statusById,
        archivedIds: ARCHIVED_NONE,
      }),
    ).toBe('newer');
  });

  it('★ 全 idle ⇒ null（调用方据此退回"第一条"）；工作区为 null 也不猜', () => {
    const sessions = snapshot([summary('a'), summary('b')]);

    expect(
      attentionSessionIdOf({
        workspace: workspace('wa', ['a', 'b']),
        sessions,
        statusById: statuses([]),
        archivedIds: ARCHIVED_NONE,
      }),
    ).toBeNull();
    expect(
      attentionSessionIdOf({ workspace: null, sessions, statusById: new Map(), archivedIds: ARCHIVED_NONE }),
    ).toBeNull();
  });

  it('★ 只有在跑时挑在跑那条：**更新更近的 idle 抢不走它**，同档按最近更新、再按 id', () => {
    const sessions = snapshot([
      summary('run-old', { updatedAt: 3 }),
      summary('run-new', { updatedAt: 4 }),
      summary('idle-newest', { updatedAt: 9 }),
    ]);

    expect(
      attentionSessionIdOf({
        workspace: workspace('wa', ['run-old', 'run-new', 'idle-newest']),
        sessions,
        statusById: statuses([
          ['run-old', { running: true }],
          ['run-new', { running: true }],
        ]),
        archivedIds: ARCHIVED_NONE,
      }),
    ).toBe('run-new');
  });

  it('★ 子代理在跑也算父会话"在跑"（与工作区那颗点同口径）', () => {
    const sessions = snapshot(
      [summary('parent', { updatedAt: 1 }), summary('child'), summary('idle-newest', { updatedAt: 9 })],
      { parent: ['child'] },
    );

    expect(
      attentionSessionIdOf({
        workspace: workspace('wa', ['parent', 'idle-newest']),
        sessions,
        statusById: statuses([['child', { running: true }]]),
        archivedIds: ARCHIVED_NONE,
      }),
    ).toBe('parent');
  });
});

describe('attentionLabel 与 attentionWordLabel', () => {
  it('★ 长句：按档与单复数取一句（三档都有）', () => {
    expect(attentionLabel({ severity: 'warning', count: 1 }, t)).toBe('project.attention.warning.one:1');
    expect(attentionLabel({ severity: 'warning', count: 2 }, t)).toBe('project.attention.warning.other:2');
    expect(attentionLabel({ severity: 'ongoing', count: 1 }, t)).toBe('project.attention.running.one:1');
    expect(attentionLabel({ severity: 'done', count: 3 }, t)).toBe('project.attention.done.other:3');
  });

  it('★ 这一档说的是长任务时换那一句（没有会话在跑，就不能说「N 个会话在跑」）', () => {
    expect(attentionLabel({ severity: 'ongoing', count: 1, longTask: true }, t)).toBe(
      'project.attention.longTask.one:1',
    );
    expect(attentionLabel({ severity: 'ongoing', count: 2, longTask: true }, t)).toBe(
      'project.attention.longTask.other:2',
    );
  });

  it('★ 短词：标签上就那三个字（触发器只打 warning / done 两档）', () => {
    expect(attentionWordLabel({ severity: 'warning', count: 1 }, t)).toBe('project.attention.state.warning');
    expect(attentionWordLabel({ severity: 'ongoing', count: 2 }, t)).toBe('project.attention.state.running');
    expect(attentionWordLabel({ severity: 'done', count: 1 }, t)).toBe('project.attention.state.done');
  });
});
