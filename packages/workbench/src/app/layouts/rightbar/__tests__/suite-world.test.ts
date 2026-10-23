import { describe, expect, it } from 'vitest';
import type { SessionsSnapshot, WorkspaceSnapshot } from '@dsh-workbench/shared';
import { createSuiteWorld } from '../suite-world';
import type { PanelUnit } from '../use-panels';

const sessions: SessionsSnapshot = {
  byId: {
    s1: {
      id: 's1',
      displayTitle: '一条会话',
      blank: false,
      running: false,
      updatedAt: 1,
      retainedBy: { mainView: 1 },
    },
  },
  projectionsBySession: {},
};

const workspaces: WorkspaceSnapshot = {
  items: [
    {
      workspaceId: 'w1',
      path: '/tmp/demo',
      title: 'DEMO-PROJ',
      sessionIds: ['s1'],
      createdAt: 1,
      updatedAt: 2,
    },
    {
      workspaceId: 'w2',
      path: '/tmp/empty',
      title: 'EMPTY-PROJ',
      sessionIds: [],
      createdAt: 3,
      updatedAt: 4,
    },
  ],
  archivedSessionIds: [],
  pinnedSessionIds: [],
};

const units: PanelUnit[] = [
  { id: 'issues', titleKey: 'issues.mine', shown: true, source: 'user', hasCard: true },
  { id: 'builds', titleKey: 'builds.title', shown: false, source: 'default', hasCard: true },
];

describe('createSuiteWorld', () => {
  it('★ 工作区**连 title 一起**下发（不再裁剪成 id + path）', () => {
    const world = createSuiteWorld({ workspaces, sessions, manifests: [], units, capabilities: null });

    expect(world.current.workspace?.title).toBe('DEMO-PROJ');
    expect(world.current.workspace?.path).toBe('/tmp/demo');
    expect(world.workspaces).toBe(workspaces);
    expect(world.sessions).toBe(sessions);
  });

  it('当前会话 = 主视图保留的那条；工作区是它所属的那个', () => {
    const world = createSuiteWorld({ workspaces, sessions, manifests: [], units, capabilities: null });

    expect(world.current.sessionId).toBe('s1');
    expect(world.current.workspace?.workspaceId).toBe('w1');
  });

  it('★ 侧栏**选中的**项目优先于"保留会话所属的工作区"（切到还没有会话的项目时，面板也得跟着换）', () => {
    const world = createSuiteWorld({
      workspaces,
      sessions,
      manifests: [],
      units,
      capabilities: null,
      selectedWorkspaceId: 'w2',
    });

    expect(world.current.workspace?.workspaceId).toBe('w2');
    expect(world.current.sessionId).toBe('s1');
  });

  it('选中的项目已经不存在（工作区被删）→ 退回保留会话所属的那个，不是 null', () => {
    const world = createSuiteWorld({
      workspaces,
      sessions,
      manifests: [],
      units,
      capabilities: null,
      selectedWorkspaceId: 'w-gone',
    });

    expect(world.current.workspace?.workspaceId).toBe('w1');
  });

  it('没有会话 / 会话不属于任何工作区 → 两个字段都给 null（不猜）', () => {
    const empty = createSuiteWorld({
      workspaces: { items: [], archivedSessionIds: [], pinnedSessionIds: [] },
      sessions: { byId: {}, projectionsBySession: {} },
      manifests: [],
      units: null,
      capabilities: null,
    });

    expect(empty.current).toEqual({ sessionId: null, workspace: null });
  });

  it('panelConfig 只放"配置里写着什么"（事实），不掺"该渲染哪些"（决策）', () => {
    const world = createSuiteWorld({ workspaces, sessions, manifests: [], units, capabilities: null });

    expect(world.panelConfig).toEqual({ shown: { issues: true, builds: false } });
    expect(world).not.toHaveProperty('visibleModules');
    expect(world).not.toHaveProperty('enabledUnits');
  });

  it('★ 读不到就说读不到：配置与能力都是 null，不用默认值兜底', () => {
    const world = createSuiteWorld({ workspaces, sessions, manifests: [], units: null, capabilities: null });

    expect(world.panelConfig).toBeNull();
    expect(world.capabilities).toBeNull();
  });

  it('能力探测与清单纯属透传（外壳不加工）', () => {
    const capabilities = { issues: { unit: 'issues', status: 'ok' } } as never;
    const manifests = [{ id: 'issues' }] as never;
    const world = createSuiteWorld({ workspaces, sessions, manifests, units, capabilities });

    expect(world.capabilities).toBe(capabilities);
    expect(world.manifests).toBe(manifests);
  });
});
