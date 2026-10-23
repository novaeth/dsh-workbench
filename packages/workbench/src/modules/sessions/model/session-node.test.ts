import { describe, expect, it } from 'vitest';
import type {
  SessionStatus,
  SessionStatusSnapshot,
  SessionSummary,
  SessionsSnapshot,
  Translate,
} from '@dsh-workbench/shared';
import {
  currentSessionId,
  orderByRecency,
  sessionNode,
  orderSessionRows,
  sessionRows,
  sessionStatuses,
  workspaceOfSession,
} from './session-node';

const t: Translate = (key, params) =>
  params === undefined ? key : `${key}:${String(params.n ?? '')}`;

function summary(patch: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 's1',
    displayTitle: '会话一',
    blank: false,
    running: false,
    updatedAt: 1_700_000_000_000,
    retainedBy: {},
    ...patch,
  };
}

function snapshot(rows: SessionSummary[], subagents: Record<string, string[]> = {}): SessionsSnapshot {
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

describe('sessionNode', () => {
  it('running 取 `status.running ?? summary.running`（不是判 undefined 就回退）', () => {
    const list = snapshot([summary({ id: 'a', running: true }), summary({ id: 'b', running: true })]);

    expect(sessionNode(list.byId.a as SessionSummary, new Map([['a', { running: false }]]), list, new Set(), new Set()).running).toBe(false);
    expect(sessionNode(list.byId.b as SessionSummary, new Map([['b', {}]]), list, new Set(), new Set()).running).toBe(true);
  });

  it('空会话没有标题（blank → ""），显示名由渲染层换成「新会话」', () => {
    const list = snapshot([summary({ blank: true, displayTitle: '未命名' })]);
    expect(sessionNode(list.byId.s1 as SessionSummary, new Map(), list, new Set(), new Set()).title).toBe('');
  });

  it('待交互只认三类 kind，其余忽略', () => {
    const list = snapshot([summary()]);
    const node = (kind: string) =>
      sessionNode(
        list.byId.s1 as SessionSummary,
        new Map([['s1', { pendingInteraction: { kind } }]]),
        list,
        new Set(),
        new Set(),
      ).pendingInteraction;

    expect(node('approval')).toBe('approval');
    expect(node('plan-review')).toBe('plan-review');
    expect(node('question')).toBe('question');
    expect(node('other')).toBeUndefined();
    expect(node('')).toBeUndefined();
  });

  it('completed 只在 completionUnread === true 时成立', () => {
    const list = snapshot([summary()]);
    const node = (value: boolean | undefined) =>
      sessionNode(
        list.byId.s1 as SessionSummary,
        new Map([['s1', { completionUnread: value }]]),
        list,
        new Set(),
        new Set(),
      ).completed;

    expect(node(true)).toBe(true);
    expect(node(false)).toBe(false);
    expect(node(undefined)).toBe(false);
  });

  it('子代理计数：只数 running 为真的子会话', () => {
    const list = snapshot(
      [summary({ id: 'parent' }), summary({ id: 'c1' }), summary({ id: 'c2' })],
      { parent: ['c1', 'c2'] },
    );
    const statusById = statuses([
      ['c1', { running: true }],
      ['c2', { running: false }],
    ]);

    expect(
      sessionNode(list.byId.parent as SessionSummary, statusById, list, new Set(), new Set())
        .runningSubagentCount,
    ).toBe(1);
  });

  it('子代理没有 status 时回退到 summary.running', () => {
    const list = snapshot([summary({ id: 'parent' }), summary({ id: 'c1', running: true })], {
      parent: ['c1'],
    });
    expect(
      sessionNode(list.byId.parent as SessionSummary, new Map(), list, new Set(), new Set())
        .runningSubagentCount,
    ).toBe(1);
  });

  it('已归档的会话不算置顶', () => {
    const list = snapshot([summary({ id: 'a' }), summary({ id: 'b' })]);
    const pinned = new Set(['a', 'b']);
    const archived = new Set(['a']);

    expect(sessionNode(list.byId.a as SessionSummary, new Map(), list, pinned, archived).pinned).toBe(false);
    expect(sessionNode(list.byId.b as SessionSummary, new Map(), list, pinned, archived).pinned).toBe(true);
  });
});

describe('sessionStatuses：优先级顺序', () => {
  const list = snapshot([summary()]);
  const plain = sessionNode(list.byId.s1 as SessionSummary, new Map(), list, new Set(), new Set());

  it('待交互压过运行中', () => {
    const dots = sessionStatuses(
      { ...plain, running: true, pendingInteraction: 'approval' },
      t,
    );
    expect(dots[0]).toEqual({
      state: 'warning',
      label: 'status.waitingApproval',
      trailingLabel: 'status.compact.approval',
    });
  });

  it('★ 待交互还给尾格一句短话（dsh 的 trailingLabel），其余档位不给', () => {
    const compact = (kind: string): string | undefined =>
      sessionStatuses({ ...plain, pendingInteraction: kind }, t)[0]?.trailingLabel;

    expect(compact('approval')).toBe('status.compact.approval');
    expect(compact('plan-review')).toBe('status.compact.planReview');
    expect(compact('question')).toBe('status.compact.answer');
    expect(sessionStatuses({ ...plain, running: true }, t)[0]?.trailingLabel).toBeUndefined();
    expect(sessionStatuses({ ...plain, completed: true }, t)[0]?.trailingLabel).toBeUndefined();
    expect(sessionStatuses(plain, t)[0]?.trailingLabel).toBeUndefined();
  });

  it('运行中时子代理作为第二颗点跟在后面', () => {
    const dots = sessionStatuses({ ...plain, running: true, runningSubagentCount: 2 }, t);
    expect(dots.map((dot) => dot.state)).toEqual(['ongoing', 'ongoing']);
    expect(dots[0]?.label).toBe('status.running');
    expect(dots[1]?.label).toBe('status.subagentsRunning.other:2');
  });

  it('子代理单数用 one 键', () => {
    const dots = sessionStatuses({ ...plain, runningSubagentCount: 1 }, t);
    expect(dots[0]?.label).toBe('status.subagentsRunning.one:1');
  });

  it('完成未读 → done；都没有 → idle', () => {
    expect(sessionStatuses({ ...plain, completed: true }, t)[0]?.state).toBe('done');
    expect(sessionStatuses(plain, t)[0]?.state).toBe('idle');
  });

  it('★★ 长任务在跑 → 一颗 ongoing 的点、那句「长任务在跑」（不占尾格：时间照旧留着）', () => {
    const dots = sessionStatuses({ ...plain, longTask: true }, t);

    expect(dots).toEqual([{ state: 'ongoing', label: 'status.longTask' }]);
  });

  it('★ 自己也跑着 + 长任务在跑：两句都在（行上那颗点还是 ongoing）；等交互仍然压过它们', () => {
    const both = sessionStatuses({ ...plain, running: true, longTask: true }, t);

    expect(both.map((dot) => dot.label)).toEqual(['status.running', 'status.longTask']);
    expect(sessionStatuses({ ...plain, longTask: true, pendingInteraction: 'approval' }, t)[0]?.state).toBe(
      'warning',
    );
  });
});

describe('sessionNode 与 longTaskIds', () => {
  it('★ 只有名字在那一沓里的会话才算 longTask（外壳按「这趟是谁起的」算出来的）', () => {
    const list = snapshot([summary({ id: 'a' }), summary({ id: 'b' })]);

    expect(sessionNode(list.byId.a as SessionSummary, new Map(), list, new Set(), new Set(), new Set(['a'])).longTask).toBe(true);
    expect(sessionNode(list.byId.b as SessionSummary, new Map(), list, new Set(), new Set(), new Set(['a'])).longTask).toBe(false);
    expect(sessionNode(list.byId.a as SessionSummary, new Map(), list, new Set(), new Set()).longTask).toBe(false);
  });
});

describe('currentSessionId', () => {
  const list = snapshot([
    summary({ id: 'a', retainedBy: {} }),
    summary({ id: 'b', retainedBy: { mainView: 2 } }),
  ]);

  it('取被对话面板持有引用的那一条', () => {
    expect(currentSessionId(list, false)).toBe('b');
  });

  it('全局面板激活时不选中任何行', () => {
    expect(currentSessionId(list, true)).toBeUndefined();
  });

  it('没有持有引用时给 undefined', () => {
    expect(currentSessionId(snapshot([summary({ id: 'a' })]), false)).toBeUndefined();
  });
});

describe('orderByRecency（dsh 那份逐字）', () => {
  it('★ 按 updatedAt 降序', () => {
    const rows = [
      summary({ id: 'old', updatedAt: 100 }),
      summary({ id: 'new', updatedAt: 300 }),
      summary({ id: 'mid', updatedAt: 200 }),
    ];

    expect(orderByRecency(rows).map((row) => row.id)).toEqual(['new', 'mid', 'old']);
  });

  it('★ 同一时刻按 id 升序兜底（dsh 的确定性 tie-break，不是"保持原顺序"）', () => {
    const rows = [
      summary({ id: 'b', updatedAt: 5 }),
      summary({ id: 'a', updatedAt: 5 }),
      summary({ id: 'c', updatedAt: 5 }),
    ];

    expect(orderByRecency(rows).map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('不改原数组（进料那份是调用方的）', () => {
    const rows = [summary({ id: 'old', updatedAt: 1 }), summary({ id: 'new', updatedAt: 2 })];
    orderByRecency(rows);

    expect(rows.map((row) => row.id)).toEqual(['old', 'new']);
  });
});

describe('sessionRows', () => {
  const list = snapshot([
    summary({ id: 'a', updatedAt: 2 }),
    summary({ id: 'b', updatedAt: 4 }),
    summary({ id: 'c', origin: 'subagent', updatedAt: 5 }),
    summary({ id: 'd', updatedAt: 3 }),
  ]);

  it('★ 过滤归档与子代理，剩下的按最近更新排（不再按 members 数组的顺序）', () => {
    const rows = sessionRows(['a', 'b', 'c', 'd'], list, new Set(['d']));
    expect(rows.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('顺序账户里不存在的 id 被忽略（不会产出 undefined 行）', () => {
    const rows = sessionRows(['a', 'missing'], list, new Set());
    expect(rows.map((row) => row.id)).toEqual(['a']);
  });
});

describe('workspaceOfSession', () => {
  const workspaces = [
    { workspaceId: 'w1', sessionIds: ['a', 'b'] },
    { workspaceId: 'w2', sessionIds: ['c'] },
  ];

  it('按 sessionIds 找到所属工作区', () => {
    expect(workspaceOfSession(workspaces, 'b')?.workspaceId).toBe('w1');
    expect(workspaceOfSession(workspaces, 'c')?.workspaceId).toBe('w2');
  });

  it('没有当前会话 / 找不到归属时给 null（面板据此显示空态）', () => {
    expect(workspaceOfSession(workspaces, undefined)).toBeNull();
    expect(workspaceOfSession(workspaces, 'zzz')).toBeNull();
    expect(workspaceOfSession([], 'a')).toBeNull();
  });
});

describe('sessionRows：空白会话的可见性（与 dsh 同一口径）', () => {
  const list = snapshot([
    summary({ id: 'blank-1', blank: true, updatedAt: 30 }),
    summary({ id: 'real-1', updatedAt: 20 }),
    summary({ id: 'blank-2', blank: true, updatedAt: 10 }),
  ]);

  it('★ 空白会话**只有当前选中那条**可见（不发消息切走 → 那一行自己消失）', () => {
    const ids = ['blank-1', 'real-1', 'blank-2'];

    expect(sessionRows(ids, list, new Set(), 'real-1').map((row) => row.id)).toEqual(['real-1']);
    expect(sessionRows(ids, list, new Set(), 'blank-2').map((row) => row.id)).toEqual(['real-1', 'blank-2']);
    expect(sessionRows(ids, list, new Set(), undefined).map((row) => row.id)).toEqual(['real-1']);
  });
});

describe('orderSessionRows（显示顺序：空白 → 置顶 → 其余）', () => {
  const rows = [
    summary({ id: 'r1' }),
    summary({ id: 'p1' }),
    summary({ id: 'blank' , blank: true }),
    summary({ id: 'r2' }),
    summary({ id: 'p2' }),
  ];

  it('★ 空白在最前、置顶次之、其余保持**进料顺序**（时间排序在 sessionRows 那一层做完了）', () => {
    const ordered = orderSessionRows(rows, new Set(['p1', 'p2']), new Set());

    expect(ordered.map((row) => row.id)).toEqual(['blank', 'p1', 'p2', 'r1', 'r2']);
  });

  it('归档过的即使被置顶过也算普通段（dsh 的 `!archived && pinned`）', () => {
    const ordered = orderSessionRows(rows, new Set(['p1']), new Set(['p1']));

    expect(ordered.map((row) => row.id)).toEqual(['blank', 'r1', 'p1', 'r2', 'p2']);
  });
});
