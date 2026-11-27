import { describe, expect, it, vi } from 'vitest';
import type { DshSessionId, DshWorkspaceRecord } from '@dsh-workbench/shared/host';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { ensureWorkshopFirstSession } from '../workshop-session';

const PATH = '/Users/you/.dsh/workbench/diy';

function workspaceOf(sessionIds: readonly string[]): DshWorkspaceRecord {
  return {
    id: 'w-diy',
    path: PATH,
    title: '工作台DIY',
    createdAt: '2026-11-27T00:00:00.000Z',
    updatedAt: '2026-11-27T00:00:00.000Z',
    sessionIds,
  } as unknown as DshWorkspaceRecord;
}

function harness(sessionIds: readonly string[]) {
  const create = vi.fn(() => Promise.resolve(workspaceOf(sessionIds)));
  const sessions = vi.fn(() => Promise.resolve({ sessionId: 's-1' as DshSessionId, agentPreset: DIY_PRESET_ID }));
  return {
    registry: { create },
    sessions: { create: sessions },
    create,
    sessionsCreate: sessions,
  };
}

describe('工坊首会话由宿主侧建，且只建一次', () => {
  it('★ 空工坊：登记工作区后按 DIY preset 建首会话', async () => {
    const box = harness([]);

    const created = await ensureWorkshopFirstSession(box, PATH);

    expect(created).toBe(true);
    expect(box.create).toHaveBeenCalledWith(PATH, '工作台DIY');
    expect(box.sessionsCreate).toHaveBeenCalledWith({ workspaceId: 'w-diy', agentPreset: DIY_PRESET_ID });
  });

  it('已经有会话：不再建第二条', async () => {
    const box = harness(['s-0']);

    const created = await ensureWorkshopFirstSession(box, PATH);

    expect(created).toBe(false);
    expect(box.sessionsCreate).not.toHaveBeenCalled();
  });

  it('这个 dsh 没有会话控制器：只登记工作区，不建会话也不抛', async () => {
    const box = harness([]);

    const created = await ensureWorkshopFirstSession({ registry: box.registry, sessions: undefined }, PATH);

    expect(created).toBe(false);
    expect(box.sessionsCreate).not.toHaveBeenCalled();
  });

  it('登记工作区失败就抛给调用方（那里记日志，不吞）', async () => {
    const registry = { create: vi.fn(() => Promise.reject(new Error('目录不在'))) };

    await expect(
      ensureWorkshopFirstSession({ registry, sessions: { create: vi.fn() } }, PATH),
    ).rejects.toThrow('目录不在');
  });
});
