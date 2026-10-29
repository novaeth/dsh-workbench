import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  reportPanelCrash,
  reportPanelRead,
  setPanelWorkspace,
  unitOfRoute,
} from '../panel-state-report';

interface Sent {
  readonly url: string;
  readonly body: Record<string, unknown>;
}

function stubFetch(): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', (url: string, init: { body?: string }) => {
    sent.push({ url: String(url), body: JSON.parse(init.body ?? '{}') as Record<string, unknown> });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) });
  });
  return sent;
}

describe('panel-state-report（浏览器半侧把面板运行态报给宿主）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setPanelWorkspace(null);
  });

  afterEach(() => {
    setPanelWorkspace(null);
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('unit 从路由前缀取（外壳自己的路由不算卡片）', () => {
    expect(unitOfRoute('demo/overview')).toBe('demo');
    expect(unitOfRoute('panels')).toBeNull();
    expect(unitOfRoute('/leading')).toBeNull();
  });

  it('没有工作区就不报（面板运行态是按工作区存的）', () => {
    const sent = stubFetch();
    reportPanelRead({ unit: 'demo', route: 'demo/overview', phase: 'ready' });
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual([]);
  });

  it('同一个 route 连报几次只发一条（合并，后报的盖掉先报的）', () => {
    const sent = stubFetch();
    setPanelWorkspace('/w/a');
    reportPanelRead({ unit: 'demo', route: 'demo/overview', phase: 'loading' });
    reportPanelRead({ unit: 'demo', route: 'demo/overview', phase: 'error', error: { code: 'host-500', message: '炸了' } });
    vi.advanceTimersByTime(1000);

    expect(sent).toHaveLength(1);
    const cards = sent[0]?.body['cards'] as Array<Record<string, unknown>>;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ unit: 'demo', route: 'demo/overview', phase: 'error' });
    expect(sent[0]?.body['workspace']).toBe('/w/a');
    expect(sent[0]?.url).toContain('/workbench/api/panel-state/cards');
  });

  it('工作区在合并窗口里才定下来：那条上报照样发（子组件的 effect 先跑、父组件后设工作区）', () => {
    const sent = stubFetch();
    reportPanelRead({ unit: 'demo', route: 'demo/overview', phase: 'loading' });
    setPanelWorkspace('/w/a');
    vi.advanceTimersByTime(1000);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.body['workspace']).toBe('/w/a');
  });

  it('切工作区：没发出去的旧工作区上报直接丢掉（不能记到新工作区头上）', () => {
    const sent = stubFetch();
    setPanelWorkspace('/w/a');
    reportPanelRead({ unit: 'demo', route: 'demo/overview', phase: 'ready' });
    setPanelWorkspace('/w/b');
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual([]);
  });

  it('崩了立刻报（不排队、不合并：它是这一刻的现场）', () => {
    const sent = stubFetch();
    setPanelWorkspace('/w/a');
    reportPanelCrash({ unit: 'demo', reason: 'Cannot read properties of undefined' });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toContain('/workbench/api/panel-state/crash');
    expect(sent[0]?.body).toMatchObject({ unit: 'demo', reason: 'Cannot read properties of undefined' });
  });

  it('宿主没起来 / 网络炸了：上报失败不抛（面板不该因为遥测挂掉）', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')));
    setPanelWorkspace('/w/a');
    reportPanelCrash({ unit: 'demo', reason: 'boom' });
    reportPanelRead({ unit: 'demo', route: 'demo/overview', phase: 'ready' });
    vi.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(true).toBe(true);
  });
});
