import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DshClientContext, SessionsSnapshot, SessionSummary, WorkspaceSnapshot } from '@dsh-workbench/shared';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { installWorkshopPreset } from '../workshop-preset';

const WORKSHOP_PATH = '/Users/you/.dsh/workbench/diy';

function sessionOf(input: { blank?: boolean; preset?: string | null }): SessionSummary {
  return {
    id: 's1',
    displayTitle: '新会话',
    blank: input.blank ?? true,
    running: false,
    updatedAt: 1,
    retainedBy: { mainView: 1 },
    ...(input.preset === undefined ? {} : { projectionValues: { agentPreset: input.preset } }),
  };
}

function harness(
  input: {
    path?: string;
    session?: SessionSummary | null;
    presets?: boolean;
    defaultPreset?: string;
    select?: () => Promise<{ ok: boolean }>;
    contextMenus?: { notify: ReturnType<typeof vi.fn> };
  } = {},
) {
  const select = vi.fn(input.select ?? (() => Promise.resolve({ ok: true })))
  const listeners = new Set<() => void>();
  let byId: SessionsSnapshot['byId'] = input.session === null ? {} : { s1: input.session ?? sessionOf({}) };
  const workspaces: WorkspaceSnapshot = {
    items: [
      {
        workspaceId: 'w-diy',
        path: input.path ?? WORKSHOP_PATH,
        title: '工作台DIY',
        sessionIds: ['s1'],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    archivedSessionIds: [],
    pinnedSessionIds: [],
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const sessions = {
    list: {
      getSnapshot: (): SessionsSnapshot => ({ byId, projectionsBySession: {} }),
      subscribe,
    },
  };
  const ctx = {
    get: (name: string) =>
      name === 'sessions' ? sessions : name === 'contextMenus' ? input.contextMenus : undefined,
    remote:
      input.presets === false
        ? {}
        : {
            agentPresets: {
              select,
              list: () =>
                Promise.resolve({
                  ok: true as const,
                  value: { presets: [{ id: input.defaultPreset ?? 'standard', isDefault: true }] },
                }),
            },
          },
    workspaces: { list: { getSnapshot: () => workspaces, subscribe } },
  } as unknown as DshClientContext;
  return {
    ctx,
    select,
    appear(next: SessionSummary | null) {
      byId = next === null ? {} : { s1: next };
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('工坊空白会话补 DIY 模式', () => {
  it('★ 首启那条空白、没记录过模式 → 补 workbench-diy（三行全绿却少一把手的那个症状）', () => {
    const { ctx, select } = harness();
    installWorkshopPreset(ctx);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith('s1', DIY_PRESET_ID);
  });

  it('★ 写口经官方 ctx.remote.agentPresets 拿：这一位不在也不能把 apply 炸掉（真机 = 整个外壳 + 全部模块不激活）', () => {
    const { ctx, select } = harness();
    expect(() => installWorkshopPreset(ctx)).not.toThrow();
    expect(select).toHaveBeenCalledWith('s1', DIY_PRESET_ID);
  });

  it('同一条会话只补一次（快照每变一次就再 select 一遍会反复抢用户的模式）', () => {
    const { ctx, select, appear } = harness();
    installWorkshopPreset(ctx);
    appear(sessionOf({}));
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('★ dsh 建会话就把默认模式写进 header（standard）—— 那不算用户选过，照样补', () => {
    const standard = harness({ session: sessionOf({ preset: 'standard' }) });
    installWorkshopPreset(standard.ctx);
    expect(standard.select).toHaveBeenCalledWith('s1', DIY_PRESET_ID);
  });

  it('用户选了别的模式就不碰；开跑之后也不碰', () => {
    const chosen = harness({ session: sessionOf({ preset: 'ptc' }) });
    installWorkshopPreset(chosen.ctx);
    expect(chosen.select).not.toHaveBeenCalled();

    const started = harness({ session: sessionOf({ blank: false }) });
    installWorkshopPreset(started.ctx);
    expect(started.select).not.toHaveBeenCalled();
  });

  it('别的项目不碰；dsh 没有那个写口时也不炸', () => {
    const elsewhere = harness({ path: '/Users/you/项目/个人项目/dsh-workbench' });
    installWorkshopPreset(elsewhere.ctx);
    expect(elsewhere.select).not.toHaveBeenCalled();

    const bare = harness({ presets: false });
    expect(() => installWorkshopPreset(bare.ctx)).not.toThrow();
  });

  it('dsh 晚一拍才把会话建出来：订阅到了也补', () => {
    const { ctx, select, appear } = harness({ session: null });
    installWorkshopPreset(ctx);
    expect(select).not.toHaveBeenCalled();

    appear(sessionOf({}));
    expect(select).toHaveBeenCalledWith('s1', DIY_PRESET_ID);
  });

  it('★ 第一次没切成：退避之后重试，成功之后才不再重复', async () => {
    vi.useFakeTimers();
    const select = vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValueOnce({ ok: true });
    const { ctx, appear } = harness({
      select: () => select() as Promise<{ ok: boolean }>,
    });
    installWorkshopPreset(ctx);
    await Promise.resolve();
    await Promise.resolve();
    expect(select).toHaveBeenCalledTimes(1);

    appear(sessionOf({}));
    await Promise.resolve();
    await Promise.resolve();
    expect(select).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(select).toHaveBeenCalledTimes(2);

    appear(sessionOf({}));
    await Promise.resolve();
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('★ 连续三次失败给用户一句可见的说明，不只是一条 console.warn', async () => {
    vi.useFakeTimers();
    const notify = vi.fn();
    const select = vi.fn(() => Promise.reject(new Error('no')));
    const { ctx, appear } = harness({
      select: () => select() as Promise<{ ok: boolean }>,
      contextMenus: { notify },
    });
    installWorkshopPreset(ctx);
    for (let i = 0; i < 2; i += 1) {
      await Promise.resolve();
      await Promise.resolve();
      appear(sessionOf({}));
      await vi.advanceTimersByTimeAsync(1000 * 2 ** i);
      await Promise.resolve();
      await Promise.resolve();
    }

    expect(notify).toHaveBeenCalledWith(expect.stringContaining('请在模式选择器中选择 DIY 模式'), false);
  });
});
