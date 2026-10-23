import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readKeyOf, requestResource, resourceIdentity } from '../use-api-resource';

function stubFetch(): { signals: AbortSignal[]; calls: () => number } {
  const signals: AbortSignal[] = [];
  let calls = 0;
  vi.stubGlobal('fetch', (_url: string, init?: { signal?: AbortSignal }) => {
    calls += 1;
    if (init?.signal !== undefined) signals.push(init.signal);
    return new Promise<Response>(() => undefined);
  });
  return { signals, calls: () => calls };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('身份与"这一次真读"是两件事', () => {
  const identity = (): string => resourceIdentity('inventory/binding', { path: '/w/a' });

  it('★ 身份只认真正的身份：查询变了才是另一份数据（键序无关）', () => {
    expect(resourceIdentity('inventory/binding', { path: '/w/a' })).toBe('inventory/binding?path=%2Fw%2Fa');
    expect(resourceIdentity('r', { a: '1', b: '2' })).toBe(resourceIdentity('r', { b: '2', a: '1' }));
    expect(resourceIdentity('inventory/summary', { path: '/w/a', fresh: 1 }, 'inventory/summary?path=/w/a')).toBe(
      'inventory/summary?path=/w/a',
    );
  });

  it('★ 刷新代号变了 ⇒ 请求是新的（不搭"写之前起飞"的那辆车），但**身份没变**', () => {
    expect(readKeyOf(identity(), 1, 7)).not.toBe(readKeyOf(identity(), 2, 7));
    expect(resourceIdentity('inventory/binding', { path: '/w/a' })).toBe(identity());
  });

  it('★ 事实修订变了 ⇒ 请求也是新的（agent 写完之后那次读同样不许搭旧车）', () => {
    expect(readKeyOf(identity(), 1, 7)).not.toBe(readKeyOf(identity(), 1, 8));
  });

  it('两个消费者同一代 ⇒ 同一个键（该搭车的时候仍然搭车）', () => {
    expect(readKeyOf(identity(), 3, 9)).toBe(readKeyOf(identity(), 3, 9));
  });
});

describe('requestResource', () => {
  it('★ 同 key 搭车：两个消费者只发一次真请求；**第一个放手不掐**，最后一个才掐', () => {
    const fetchState = stubFetch();

    const first = requestResource('inventory/summary', { path: '/w/a' }, 'inventory/summary?path=/w/a');
    const second = requestResource('inventory/summary', { path: '/w/a' }, 'inventory/summary?path=/w/a');

    expect(fetchState.calls()).toBe(1);
    expect(first.task).toBe(second.task);
    const signal = fetchState.signals[0] as AbortSignal;
    expect(signal.aborted).toBe(false);

    first.release();
    expect(signal.aborted).toBe(false);

    second.release();
    expect(signal.aborted).toBe(true);
    void first.task.catch(() => undefined);
    void second.task.catch(() => undefined);
  });

  it('不同 key 各发各的（切工作区就是换 key）', () => {
    const fetchState = stubFetch();

    const a = requestResource('inventory/summary', { path: '/w/a' }, 'k-a');
    const b = requestResource('inventory/summary', { path: '/w/b' }, 'k-b');

    expect(fetchState.calls()).toBe(2);
    a.release();
    expect(fetchState.signals[0]?.aborted).toBe(true);
    expect(fetchState.signals[1]?.aborted).toBe(false);
    b.release();
    void a.task.catch(() => undefined);
    void b.task.catch(() => undefined);
  });

  it('重复放手不会二次 abort、也不影响别人（先摘除自己那条）', () => {
    const fetchState = stubFetch();

    const a = requestResource('panels', {}, 'k');
    a.release();
    a.release();

    expect(fetchState.signals[0]?.aborted).toBe(true);
    void a.task.catch(() => undefined);
  });
});
