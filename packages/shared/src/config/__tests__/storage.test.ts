import { afterEach, describe, expect, it, vi } from 'vitest';
import { readText, writeText } from '../storage.js';

function fakeStorage(options: { throwOnWrite?: boolean } = {}) {
  const data = new Map<string, string>();
  return {
    data,
    storage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (options.throwOnWrite === true) throw new Error('QuotaExceededError');
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    },
  };
}

function useStorage(options: { throwOnWrite?: boolean } = {}) {
  const fake = fakeStorage(options);
  vi.stubGlobal('window', { localStorage: fake.storage });
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage', () => {
  it('写进去能读回来', () => {
    const fake = useStorage();
    writeText('k', 'v');
    expect(readText('k')).toBe('v');
    expect(fake.data.get('k')).toBe('v');
  });

  it('写 null 等于删除', () => {
    const fake = useStorage();
    writeText('k', 'v');
    writeText('k', null);
    expect(readText('k')).toBeNull();
    expect(fake.data.has('k')).toBe(false);
  });

  it('localStorage 抛异常时静默降级（隐私模式不该让面板崩掉）', () => {
    useStorage({ throwOnWrite: true });
    expect(() => writeText('k', 'v')).not.toThrow();
    expect(readText('k')).toBeNull();
  });

  it('window 上没有 localStorage 时也不抛', () => {
    vi.stubGlobal('window', {});
    expect(() => writeText('k', 'v')).not.toThrow();
    expect(readText('k')).toBeNull();
  });
});
