import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectProject, selectedProjectId, subscribeProject } from '../project-selection';

function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
  return store;
}

beforeEach(() => {
  stubStorage();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('当前项目（project-selection）', () => {
  it('选谁读谁：写进去立刻读得到（并且落盘了）', () => {
    expect(selectedProjectId()).toBeNull();

    selectProject('ws-1');

    expect(selectedProjectId()).toBe('ws-1');
  });

  it('★ 写就**通知订阅者**：面板不用等下一次轮询（这正是那个 bug 的修复点）', () => {
    const seen: Array<string | null> = [];
    subscribeProject(() => seen.push(selectedProjectId()));

    selectProject('ws-a');
    selectProject('ws-b');

    expect(seen).toEqual(['ws-a', 'ws-b']);
  });

  it('退订之后不再被通知（组件卸载后不该再 setState）', () => {
    let hits = 0;
    const off = subscribeProject(() => {
      hits += 1;
    });

    selectProject('ws-a');
    off();
    selectProject('ws-b');

    expect(hits).toBe(1);
  });

  it('一个订阅者抛错不影响别人、也不让"换项目"本身失败', () => {
    let ok = 0;
    subscribeProject(() => {
      throw new Error('boom');
    });
    subscribeProject(() => {
      ok += 1;
    });

    expect(() => selectProject('ws-a')).not.toThrow();
    expect(ok).toBe(1);
    expect(selectedProjectId()).toBe('ws-a');
  });

  it('localStorage 不可用（隐私模式）→ 给 null，不崩', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
        removeItem: () => undefined,
      },
    });

    expect(selectedProjectId()).toBeNull();
    expect(() => selectProject('ws-a')).not.toThrow();
  });
});
