import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFS,
  LIMIT_MAX,
  LIMIT_MIN,
  PREF_FILE,
  applyPrefs,
  prefsOf,
  type PrefStore,
} from '../prefs';

function memoryStore(initial: Record<string, unknown> = {}): PrefStore & { readonly files: Map<string, unknown> } {
  const files = new Map<string, unknown>(Object.entries(initial));
  return {
    files,
    read: (name) => files.get(name) ?? null,
    write: (name, value) => {
      files.set(name, value);
    },
    remove: (name) => {
      files.delete(name);
    },
  };
}

describe('prefsOf', () => {
  it('没存过 / 存坏了都回默认', () => {
    expect(prefsOf(memoryStore())).toEqual(DEFAULT_PREFS);
    expect(prefsOf(memoryStore({ [PREF_FILE]: { limit: 999 } }))).toEqual(DEFAULT_PREFS);
    expect(prefsOf(memoryStore({ [PREF_FILE]: { limit: 'abc' } }))).toEqual(DEFAULT_PREFS);
  });

  it('存过的合法值读得回来', () => {
    expect(prefsOf(memoryStore({ [PREF_FILE]: { limit: 10 } })).limit).toBe(10);
  });
});

describe('applyPrefs', () => {
  it('写进去并回整份新偏好', () => {
    const store = memoryStore();
    expect(applyPrefs(store, { limit: 20 })).toEqual({ prefs: { limit: 20 } });
    expect(store.files.get(PREF_FILE)).toEqual({ limit: 20 });
  });

  it('越界 / 不是整数 / 没有 limit 都会抛，且不写', () => {
    const store = memoryStore();
    expect(() => applyPrefs(store, { limit: LIMIT_MAX + 1 })).toThrow('只认');
    expect(() => applyPrefs(store, { limit: LIMIT_MIN - 1 })).toThrow('只认');
    expect(() => applyPrefs(store, { limit: 1.5 })).toThrow('只认');
    expect(() => applyPrefs(store, {})).toThrow('没有 limit');
    expect(store.files.has(PREF_FILE)).toBe(false);
  });

  it('reset 删文件回默认', () => {
    const store = memoryStore({ [PREF_FILE]: { limit: 10 } });
    expect(applyPrefs(store, { reset: true })).toEqual({ prefs: DEFAULT_PREFS });
    expect(store.files.has(PREF_FILE)).toBe(false);
  });
});
