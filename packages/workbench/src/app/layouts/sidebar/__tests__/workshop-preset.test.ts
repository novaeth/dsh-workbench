import { describe, expect, it, vi } from 'vitest';
import type { DshClientContext, SessionsSnapshot, SessionSummary, WorkspaceSnapshot } from '@dsh-workbench/shared';
import { DIY_PRESET_ID } from '@/shared/api/diy';
import { installWorkshopPreset } from '../workshop-preset';

const WORKSHOP_PATH = '/Users/you/.dsh/workbench/diy';

function sessionOf(input: { blank?: boolean; preset?: unknown }): SessionSummary {
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

function harness(input: { path?: string; session?: SessionSummary | null; presets?: boolean } = {}) {
  const select = vi.fn(() => Promise.resolve({ ok: true }));
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
  const remote = new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(`cannot get property "remote.${String(prop)}" without inject`);
      },
    },
  );
  const ctx = {
    get: (name: string) =>
      name === 'sessions'
        ? sessions
        : name === 'remote.agentPresets' && input.presets !== false
          ? { select }
          : undefined,
    remote,
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

describe('工坊空白会话补 DIY 模式', () => {
  it('★ 首启那条空白、没记录过模式 → 补 workbench-diy（三行全绿却少一把手的那个症状）', () => {
    const { ctx, select } = harness();
    installWorkshopPreset(ctx);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith('s1', DIY_PRESET_ID);
  });

  it('★ 写口只能经 ctx.get 拿：没在 inject 里声明 remote.agentPresets 也不能把 apply 炸掉（真机 = 整个外壳 + 全部模块不激活）', () => {
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

  it('用户显式选过（标准模式记成 standard）→ 不碰；开跑之后也不碰', () => {
    const standard = harness({ session: sessionOf({ preset: 'standard' }) });
    installWorkshopPreset(standard.ctx);
    expect(standard.select).not.toHaveBeenCalled();

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
});
