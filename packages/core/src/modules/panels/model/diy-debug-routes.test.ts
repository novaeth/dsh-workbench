import { describe, expect, it } from 'vitest';
import { createDebugStore } from '@dsh-workbench/shared/host';
import { diyDebugRoutes } from './diy-debug-routes';

describe('调试态那条只读路由：让用户那一屏自己知道该画什么', () => {
  const read = (routes: ReturnType<typeof diyDebugRoutes>): { ok: boolean; state: unknown } =>
    routes['panels/diy-debug']?.(new URLSearchParams()) as { ok: boolean; state: unknown };

  it('★ 没有调试态 ⇒ ok + state: null（前端据此整条不渲染）', () => {
    const answer = read(diyDebugRoutes(createDebugStore()));

    expect(answer.ok).toBe(true);
    expect(answer.state).toBeNull();
  });

  it('★★ 开始之后 ⇒ 把这一场原样交出去（phase / unit / 目标板都在）', () => {
    const store = createDebugStore();
    store.begin({
      sessionId: 's1',
      workspacePath: '/w/diy',
      title: '演示工作区',
      board: '/w/diy',
      unit: 'demo',
      name: 'demo',
      now: Date.now(),
    });

    const answer = read(diyDebugRoutes(store)) as { ok: boolean; state: { phase: string; unit: string; board: string } };

    expect(answer.state.phase).toBe('debugging');
    expect(answer.state.unit).toBe('demo');
    expect(answer.state.board).toBe('/w/diy');
  });

  it('★ 收工之后 ⇒ 又是 null（那条提醒自己消失）', () => {
    const store = createDebugStore();
    store.begin({
      sessionId: 's1',
      workspacePath: '/w/diy',
      title: '演示工作区',
      board: '/w/diy',
      unit: 'demo',
      name: 'demo',
      now: Date.now(),
    });
    store.stop('s1', Date.now());

    expect(read(diyDebugRoutes(store)).state).toBeNull();
  });
});
