import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { createDebugStore, type DebugPact } from '@dsh-workbench/shared/host';
import { createDiyRig } from '../__tests__/diy-harness';
import { stopObservers, withObserverCleanup } from './diy-observers';

const pact = (now = 1000): DebugPact => ({
  sessionId: 's1',
  workspacePath: '/w/workbench/diy',
  title: '工坊',
  board: '/w/workbench/diy',
  unit: 'demo',
  name: 'demo',
  now,
});

function logOf(): { warnings: string[]; log: { warn(message: string): void } } {
  const warnings: string[] = [];
  return { warnings, log: { warn: (message) => warnings.push(message) } };
}

describe('收工那一拍：把这一场的观察也收了', () => {
  const rig = createDiyRig();

  it('★★ 网络那条 follower 认 pid 停、日志钩子卸掉 —— 两条命令都发得出去', async () => {
    const built = rig.harness({ probe: [{ stdout: JSON.stringify({ unhooked: 5, dropped: 0 }) }] });

    const out = await stopObservers(built.ctx as unknown as DshHostContext, rig.WORKSHOP());

    expect(out).toEqual({ net: true, logs: true });
    expect(built.commands.some((one) => one.includes('net-workbench.jsonl.pid') && one.includes('kill'))).toBe(true);
    expect(built.commands.some((one) => one.includes('[b]rowser workbench network --follow'))).toBe(false);
    expect(built.commands.some((one) => one.includes("'eval'") && one.includes('unhooked'))).toBe(true);
  });

  it('★ 没听上钩子（页面回的不是那一段）⇒ logs 老实报 false，不假装卸了', async () => {
    const built = rig.harness({ probe: [{ stdout: '{}' }] });

    expect(await stopObservers(built.ctx as unknown as DshHostContext, rig.WORKSHOP())).toEqual({ net: true, logs: false });
  });

  it('★ 这台机器上没有 shell ⇒ 两件都报 false（话说清，别假装收了）', async () => {
    const built = rig.harness({});

    expect(await stopObservers(built.ctx as unknown as DshHostContext, rig.WORKSHOP())).toEqual({
      net: false,
      logs: false,
    });
    expect(built.commands).toEqual([]);
  });

  it('★★ 没有工作区（会话不在任何工作区上）⇒ 什么都不发，也不假装收了', async () => {
    const built = rig.harness({ probe: [{ stdout: JSON.stringify({ unhooked: 5 }) }] });

    expect(await stopObservers(built.ctx as unknown as DshHostContext, null)).toEqual({ net: false, logs: false });
    expect(built.commands).toEqual([]);
  });
});

describe('套在 store 外面那一层：只有真的收工才收观察，而且等得着', () => {
  it('★★ stop 被拒（没约定）⇒ 一次都不收', async () => {
    const calls: string[] = [];
    const store = withObserverCleanup(createDebugStore(), async () => {
      calls.push('cleanup');
      return { net: true, logs: true };
    });

    expect(store.stop('s1', 1000).ok).toBe(false);
    await store.settle?.();

    expect(calls).toEqual([]);
  });

  it('★★ stop 成功 ⇒ 收一次；`settle()` 回来时它已经落地（两条收工路都靠这一拍排序）', async () => {
    const calls: string[] = [];
    const store = withObserverCleanup(createDebugStore(), async () => {
      calls.push('cleanup');
      return { net: true, logs: true };
    });
    store.begin(pact());

    expect(store.live(1000)?.unit).toBe('demo');
    expect(store.stop('s1', 1000).ok).toBe(true);
    expect(calls).toEqual([]);
    await store.settle?.();

    expect(calls).toEqual(['cleanup']);
    expect(store.live(1000)).toBeNull();
  });

  it('★★ 还没收完就有新的一场约定开始了 ⇒ 跳过（新那一场不归旧收工管），并留一条 warn', async () => {
    const calls: string[] = [];
    const { warnings, log } = logOf();
    const store = withObserverCleanup(
      createDebugStore(),
      async () => {
        calls.push('cleanup');
        return { net: true, logs: true };
      },
      log,
    );
    store.begin(pact());
    expect(store.stop('s1', 1000).ok).toBe(true);
    store.begin(pact(2000));

    await store.settle?.();

    expect(calls).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('新的调试约定');
  });

  it('★ 没收干净 / 收的时候抛了 ⇒ 都留一条 warn（不静默），settle 也不炸', async () => {
    const { warnings, log } = logOf();
    const half = withObserverCleanup(createDebugStore(), async () => ({ net: false, logs: true }), log);
    half.begin(pact());
    half.stop('s1', 1000);
    await half.settle?.();

    const boom = withObserverCleanup(
      createDebugStore(),
      async () => {
        throw new Error('kill 没跑成');
      },
      log,
    );
    boom.begin(pact());
    boom.stop('s1', 1000);
    await boom.settle?.();

    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain('没把观察收干净');
    expect(warnings[1]).toContain('kill 没跑成');
  });

  it('★ 收工收观察不影响 store 自己的四个动作（live / begin / pause / resume 原样透传）', () => {
    const store = withObserverCleanup(createDebugStore(), async () => ({ net: true, logs: true }));

    expect(store.live(1000)).toBeNull();
    expect(store.begin(pact()).ok).toBe(true);
    expect(store.live(1000)?.phase).toBe('debugging');
    expect(store.pause('s1', 1000).ok).toBe(true);
    expect(store.live(1500)?.phase).toBe('paused');
    expect(store.resume('s1', 1600).ok).toBe(true);
    expect(store.live(1700)?.phase).toBe('debugging');
  });

  it('★★ 收观察用的是**约定里那条工作区**（不是发起收工那个会话的 cwd）', async () => {
    const seen: Array<string | null> = [];
    const store = withObserverCleanup(createDebugStore(), async (workspace) => {
      seen.push(workspace);
      return { net: true, logs: true };
    });
    store.begin({ ...pact(), workspacePath: '/w/modules-repo', title: 'modules-repo', board: '/w/modules-repo' });

    expect(store.stop('s1', 1000).ok).toBe(true);
    await store.settle?.();

    expect(seen).toEqual(['/w/modules-repo']);
  });
});
