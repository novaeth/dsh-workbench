import { describe, expect, it } from 'vitest';
import type { SessionStatus, SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import type { LongTaskPresence } from '@/modules/sessions';
import { blankSessionIdOf, firstSessionIdOf, openNewSession, openPickedProject } from '../session-pick';

const NO_LONG_TASKS: LongTaskPresence = { bySession: new Set(), byWorkspace: new Map() };

function session(id: string, patch: Partial<SessionsSnapshot['byId'][string]> = {}) {
  return {
    id,
    displayTitle: id,
    blank: false,
    running: false,
    updatedAt: 1,
    retainedBy: {},
    ...patch,
  };
}

const workspace: WorkspaceView = {
  workspaceId: 'w1',
  path: '/tmp/demo',
  title: 'DEMO',
  sessionIds: ['s-old', 's-new'],
  createdAt: 1,
  updatedAt: 2,
};

const sessions: SessionsSnapshot = {
  byId: {
    's-old': session('s-old', { updatedAt: 1 }),
    's-new': session('s-new', { updatedAt: 2 }),
    's-sub': session('s-sub', { origin: 'subagent' }),
  },
  projectionsBySession: {},
};

describe('firstSessionIdOf（切项目打开哪条会话）', () => {
  it('★ 有历史会话 → 打开**列表里第一条**（与侧栏同一顺序 = 最近更新的那条，不是 members 数组的第一条）', () => {
    expect(firstSessionIdOf(workspace, sessions, new Set())).toBe('s-new');
  });

  it('第一条归档了 → 落到下一条（归档行在列表里也不显示）', () => {
    expect(firstSessionIdOf(workspace, sessions, new Set(['s-old']))).toBe('s-new');
  });

  it('★ 顶上那条是**空白会话**时不选它：历史优先（旧行为留下的空白会占掉"第一条"）', () => {
    const withBlank: SessionsSnapshot = {
      byId: { 's-blank': session('s-blank', { blank: true }), ...sessions.byId },
      projectionsBySession: {},
    };
    const ws: WorkspaceView = { ...workspace, sessionIds: ['s-blank', 's-old', 's-new'] };

    expect(firstSessionIdOf(ws, withBlank, new Set())).toBe('s-new');
    const onlyBlank: WorkspaceView = { ...workspace, sessionIds: ['s-blank'] };
    expect(firstSessionIdOf(onlyBlank, withBlank, new Set())).toBeNull();
  });

  it('★ 一条会话都没有（或全被过滤）→ null（调用方据此"新会话"）', () => {
    const empty: WorkspaceView = { ...workspace, sessionIds: [] };
    expect(firstSessionIdOf(empty, sessions, new Set())).toBeNull();
    expect(firstSessionIdOf(workspace, sessions, new Set(['s-old', 's-new']))).toBeNull();
    const onlySub: WorkspaceView = { ...workspace, sessionIds: ['s-sub'] };
    expect(firstSessionIdOf(onlySub, sessions, new Set())).toBeNull();
  });

  it('工作区找不到（或被删）→ null，不猜', () => {
    expect(firstSessionIdOf(null, sessions, new Set())).toBeNull();
  });

  it('★ 那一下的动作：有历史 → `openSession(第一条)`；没有 → `startSession(工作区)`', () => {
    const calls: string[] = [];
    const deps = {
      items: [workspace],
      sessions,
      statusById: new Map<string, SessionStatus>(),
      archivedIds: new Set<string>(),
      longTasks: NO_LONG_TASKS,
      openSession: (id: string) => calls.push(`open:${id}`),
      startSession: (id: string) => calls.push(`new:${id}`),
    };

    openPickedProject({ ...deps, workspaceId: 'w1' });
    openPickedProject({ ...deps, workspaceId: 'w2' });

    expect(calls).toEqual(['open:s-new', 'new:w2']);
  });

  it('★ 有"要你看的"会话时优先它，而不是第一条（用户：优先切到通知的那条会话）', () => {
    const calls: string[] = [];
    const deps = {
      items: [workspace],
      sessions,
      statusById: new Map<string, SessionStatus>([['s-old', { pendingInteraction: { kind: 'approval' } }]]),
      archivedIds: new Set<string>(),
      longTasks: NO_LONG_TASKS,
      openSession: (id: string) => calls.push(`open:${id}`),
      startSession: (id: string) => calls.push(`new:${id}`),
    };

    openPickedProject({ ...deps, workspaceId: 'w1' });

    expect(calls).toEqual(['open:s-old']);
  });

  it('★ 两档都有时先"等你看"（warning 压过 done），**在跑最低**', () => {
    const three: WorkspaceView = { ...workspace, sessionIds: ['s-run', 's-done', 's-wait'] };
    const many: SessionsSnapshot = {
      byId: {
        's-run': session('s-run', { updatedAt: 9 }),
        's-done': session('s-done', { updatedAt: 8 }),
        's-wait': session('s-wait', { updatedAt: 7 }),
      },
      projectionsBySession: {},
    };
    const calls: string[] = [];
    const deps = {
      items: [three],
      sessions: many,
      statusById: new Map<string, SessionStatus>([
        ['s-run', { running: true }],
        ['s-done', { running: false, completionUnread: true }],
        ['s-wait', { pendingInteraction: { kind: 'question' } }],
      ]),
      archivedIds: new Set<string>(),
      longTasks: NO_LONG_TASKS,
      openSession: (id: string) => calls.push(`open:${id}`),
      startSession: (id: string) => calls.push(`new:${id}`),
    };

    openPickedProject({ ...deps, workspaceId: 'w1' });

    expect(calls).toEqual(['open:s-wait']);
  });

  it('★ 没有"要你看的"时落到**在跑的那条**（更新更近的 idle 会话抢不走它）', () => {
    const calls: string[] = [];
    const running: WorkspaceView = { ...workspace, sessionIds: ['s-run', 's-idle'] };
    const many: SessionsSnapshot = {
      byId: {
        's-run': session('s-run', { updatedAt: 3 }),
        's-idle': session('s-idle', { updatedAt: 9 }),
      },
      projectionsBySession: {},
    };

    openPickedProject({
      items: [running],
      sessions: many,
      statusById: new Map<string, SessionStatus>([['s-run', { running: true }]]),
      archivedIds: new Set<string>(),
      longTasks: NO_LONG_TASKS,
      openSession: (id) => calls.push(`open:${id}`),
      startSession: (id) => calls.push(`new:${id}`),
      workspaceId: 'w1',
    });

    expect(calls).toEqual(['open:s-run']);
  });

  it('★ 长任务在跑的那条会话也算"在跑"、也挑得到（它是最低那一档里的）', () => {
    const calls: string[] = [];
    const busy: WorkspaceView = { ...workspace, sessionIds: ['s-task', 's-idle'] };
    const many: SessionsSnapshot = {
      byId: {
        's-task': session('s-task', { updatedAt: 3 }),
        's-idle': session('s-idle', { updatedAt: 9 }),
      },
      projectionsBySession: {},
    };

    openPickedProject({
      items: [busy],
      sessions: many,
      statusById: new Map<string, SessionStatus>(),
      archivedIds: new Set<string>(),
      longTasks: { bySession: new Set(['s-task']), byWorkspace: new Map([['/tmp/demo', 1]]) },
      openSession: (id) => calls.push(`open:${id}`),
      startSession: (id) => calls.push(`new:${id}`),
      workspaceId: 'w1',
    });

    expect(calls).toEqual(['open:s-task']);
  });
});

describe('点「新会话」：有空白就打开它，不新建（防"攒垃圾会话"）', () => {
  const blank = session('s-blank', { blank: true });
  const sessionsWithBlank: SessionsSnapshot = {
    byId: { 's-blank': blank, 's-real': session('s-real') },
    projectionsBySession: {},
  };

  it('★ 已经有空白会话 → `openSession(它)`（**不进** dsh 的新建路径，那个"写锁被占用就新建"的例外也就没机会）', () => {
    const calls: string[] = [];
    const ws: WorkspaceView = { ...workspace, sessionIds: ['s-real', 's-blank'] };

    openNewSession({
      workspace: ws,
      sessions: sessionsWithBlank,
      archivedIds: new Set(),
      openSession: (id) => calls.push(`open:${id}`),
      startSession: (id) => calls.push(`new:${id}`),
    });

    expect(calls).toEqual(['open:s-blank']);
  });

  it('一条空白都没有 → 才 `startSession`（dsh 自己会先尝试复用）', () => {
    const calls: string[] = [];
    const ws: WorkspaceView = { ...workspace, sessionIds: ['s-real'] };

    openNewSession({
      workspace: ws,
      sessions: sessionsWithBlank,
      archivedIds: new Set(),
      openSession: (id) => calls.push(`open:${id}`),
      startSession: (id) => calls.push(`new:${id}`),
    });

    expect(calls).toEqual([`new:${ws.workspaceId}`]);
  });

  it('归档过的空白不算（与 dsh 的 reuseOrCreateBlank 一致）；工作区是 null 时什么都不做', () => {
    const ws: WorkspaceView = { ...workspace, sessionIds: ['s-blank'] };
    expect(blankSessionIdOf(ws, sessionsWithBlank, new Set(['s-blank']))).toBeNull();

    const calls: string[] = [];
    openNewSession({
      workspace: null,
      sessions: sessionsWithBlank,
      archivedIds: new Set(),
      openSession: (id) => calls.push(`open:${id}`),
      startSession: (id) => calls.push(`new:${id}`),
    });
    expect(calls).toEqual([]);
  });
});

describe('工坊里的「新会话」：不自己挑空白，交给 dsh 的 startSession', () => {
  const blank = session('s-blank', { blank: true });
  const sessionsWithBlank: SessionsSnapshot = {
    byId: { 's-blank': blank, 's-real': session('s-real') },
    projectionsBySession: {},
  };
  const workshop: WorkspaceView = { ...workspace, path: '/Users/you/.dsh/workbench/diy' };

  it('★ 有空白也走 `startSession` —— 那条路会把复用到的空白**切到 DIY preset**，自己在客户端开空白就切不过去了', () => {
    const calls: string[] = [];
    const ws: WorkspaceView = { ...workshop, sessionIds: ['s-real', 's-blank'] };

    openNewSession({
      workspace: ws,
      sessions: sessionsWithBlank,
      archivedIds: new Set(),
      openSession: (id) => calls.push(`open:${id}`),
      startSession: (id) => calls.push(`new:${id}`),
    });

    expect(calls).toEqual([`new:${ws.workspaceId}`]);
  });

  it('一条会话都没有时同一条路（所以工坊永远只有"带 preset 的 startSession"这一个出口）', () => {
    const calls: string[] = [];

    openNewSession({
      workspace: { ...workshop, sessionIds: [] },
      sessions: sessionsWithBlank,
      archivedIds: new Set(),
      openSession: (id) => calls.push(`open:${id}`),
      startSession: (id) => calls.push(`new:${id}`),
    });

    expect(calls).toEqual([`new:${workshop.workspaceId}`]);
  });

  it('形近的路径不算工坊（`…/workbench`、`…/diyy` 照旧走"捞空白"那条）', () => {
    const calls: string[] = [];

    openNewSession({
      workspace: { ...workshop, path: '/Users/you/.dsh/workbench', sessionIds: ['s-blank'] },
      sessions: sessionsWithBlank,
      archivedIds: new Set(),
      openSession: (id) => calls.push(`open:${id}`),
      startSession: (id) => calls.push(`new:${id}`),
    });

    expect(calls).toEqual(['open:s-blank']);
  });
});
