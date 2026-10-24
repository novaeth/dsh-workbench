import { describe, expect, it } from 'vitest';
import type { SessionsSnapshot, WorkspaceView } from '@dsh-workbench/shared';
import { resolveCurrentWorkspace } from '../current-workspace';

function workspace(id: string, sessionIds: readonly string[]): WorkspaceView {
  return {
    workspaceId: id,
    path: `/w/${id}`,
    title: id,
    sessionIds,
    createdAt: 1,
    updatedAt: 1,
  };
}

function snapshot(rows: Array<[string, number]>): SessionsSnapshot {
  const byId: Record<string, SessionsSnapshot['byId'][string]> = {};
  for (const [id, mainViews] of rows) {
    byId[id] = {
      id,
      displayTitle: id,
      blank: false,
      running: false,
      updatedAt: 1,
      retainedBy: mainViews === 0 ? {} : { mainView: mainViews },
    };
  }
  return { byId, projectionsBySession: {} };
}

const A = workspace('wa', ['sa']);
const B = workspace('wb', ['sb']);

describe('resolveCurrentWorkspace', () => {
  it('★ 主会话在别的工作区：左栏跟过去，不认 storedId', () => {
    const current = resolveCurrentWorkspace({
      items: [A, B],
      sessions: snapshot([['sb', 1]]),
      panelActive: false,
      storedId: 'wa',
    });

    expect(current?.workspaceId).toBe('wb');
  });

  it('面板在前台时没有主会话：退回用户选的那个工作区', () => {
    const current = resolveCurrentWorkspace({
      items: [A, B],
      sessions: snapshot([['sb', 1]]),
      panelActive: true,
      storedId: 'wa',
    });

    expect(current?.workspaceId).toBe('wa');
  });

  it('没有主会话：认 storedId；storedId 不在表里（或为空）时退回第一项', () => {
    const input = { items: [A, B], sessions: snapshot([]), panelActive: false };

    expect(resolveCurrentWorkspace({ ...input, storedId: 'wb' })?.workspaceId).toBe('wb');
    expect(resolveCurrentWorkspace({ ...input, storedId: 'gone' })?.workspaceId).toBe('wa');
    expect(resolveCurrentWorkspace({ ...input, storedId: null })?.workspaceId).toBe('wa');
  });

  it('主会话不属于任何工作区（例如子代理那条）：照旧退回 storedId', () => {
    const current = resolveCurrentWorkspace({
      items: [A, B],
      sessions: snapshot([['orphan', 1]]),
      panelActive: false,
      storedId: 'wb',
    });

    expect(current?.workspaceId).toBe('wb');
  });

  it('一条工作区都没有：null（不是抛）', () => {
    expect(
      resolveCurrentWorkspace({
        items: [],
        sessions: snapshot([]),
        panelActive: false,
        storedId: 'wa',
      }),
    ).toBeNull();
  });
});
