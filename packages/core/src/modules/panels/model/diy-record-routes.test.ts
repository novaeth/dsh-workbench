import { describe, expect, it } from 'vitest';
import { createRecordStore } from '@dsh-workbench/shared/host';
import { diyRecordRoutes } from './diy-record-routes';

describe('录制交接那条只读路由：让用户那一屏自己知道该画什么', () => {
  const read = (routes: ReturnType<typeof diyRecordRoutes>): { ok: boolean; state: unknown } =>
    routes['panels/diy-record']?.(new URLSearchParams()) as { ok: boolean; state: unknown };

  it('★ 没有那一场 ⇒ ok + state: null（前端据此整条不渲染）', () => {
    const answer = read(diyRecordRoutes(createRecordStore()));

    expect(answer.ok).toBe(true);
    expect(answer.state).toBeNull();
  });

  it('★★ prepare 之后 ⇒ 把这一场原样交出去（phase / unit / 站点都在）', () => {
    const store = createRecordStore();
    store.begin({
      sessionId: 's1',
      workspace: '/w/diy',
      unit: 'demo',
      name: 'demo',
      url: 'https://inventory.example.com/env',
      title: '',
      action: '发布',
      expect: { method: 'POST', urlContains: '/api/publish' },
      captureFile: '/w/diy/shots/rec-demo.jsonl',
      now: Date.now(),
    });

    const answer = read(diyRecordRoutes(store)) as {
      ok: boolean;
      state: { phase: string; unit: string; url: string };
    };

    expect(answer.state.phase).toBe('armed');
    expect(answer.state.unit).toBe('demo');
    expect(answer.state.url).toBe('https://inventory.example.com/env');
  });

  it('★★ 落图台账随 state 一起交出去（左栏那一格据此说「已拍 N 张」）', () => {
    const store = createRecordStore();
    const now = Date.now();
    store.begin({
      sessionId: 's1',
      workspace: '/w/diy',
      unit: 'demo',
      name: 'demo',
      url: 'https://inventory.example.com/env',
      title: '',
      action: '发布',
      expect: null,
      captureFile: '/w/diy/shots/rec-demo.jsonl',
      now,
    });
    store.shotTaken('s1', { n: 1, at: 5, path: '/w/diy/shots/rec-shot-demo-1.png' }, now);

    const answer = read(diyRecordRoutes(store)) as { state: { shots: unknown } };

    expect(answer.state.shots).toEqual([{ n: 1, at: 5, path: '/w/diy/shots/rec-shot-demo-1.png' }]);
  });

  it('★ 收工之后 ⇒ 又是 null（那条提醒自己消失）', () => {
    const store = createRecordStore();
    store.begin({
      sessionId: 's1',
      workspace: '/w/diy',
      unit: 'demo',
      name: 'demo',
      url: 'https://inventory.example.com/env',
      title: '',
      action: '发布',
      expect: null,
      captureFile: '/w/diy/shots/rec-demo.jsonl',
      now: Date.now(),
    });
    store.stop('s1', Date.now());

    expect(read(diyRecordRoutes(store)).state).toBeNull();
  });
});
