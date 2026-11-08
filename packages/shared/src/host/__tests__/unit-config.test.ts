import { describe, expect, it } from 'vitest';
import { createUnitConfig, type UnitConfigStore } from '../unit-config.js';

interface Config {
  readonly name: string;
  readonly limit: number;
}

const FALLBACK: Config = { name: '', limit: 5 };

function normalize(raw: unknown): Config {
  if (typeof raw !== 'object' || raw === null) throw new Error('不是一份配置');
  const record = raw as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'] : '';
  const limit = typeof record['limit'] === 'number' ? record['limit'] : 5;
  return { name, limit };
}

function memoryStore(): UnitConfigStore & { readonly file: () => unknown } {
  let value: unknown = null;
  return {
    read: () => value,
    write: (_name, next) => {
      value = next;
    },
    remove: () => {
      value = null;
    },
    file: () => value,
  };
}

describe('单元配置的读写器', () => {
  it('★ 没存过：给兜底那份', () => {
    const config = createUnitConfig({ store: memoryStore(), file: 'config.json', fallback: FALLBACK, normalize });
    expect(config.read()).toEqual(FALLBACK);
  });

  it('★ 存过：读回来的是规范化之后的那份', () => {
    const store = memoryStore();
    store.write('config.json', { name: '工作台', limit: 10 });
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize });
    expect(config.read()).toEqual({ name: '工作台', limit: 10 });
  });

  it('★ 存坏了：退回兜底，不把坏数据带出来', () => {
    const store = memoryStore();
    store.write('config.json', 'not-json');
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize });
    expect(config.read()).toEqual(FALLBACK);
  });

  it('★ 写：先规范化再落盘，返回的就是落盘那份', () => {
    const store = memoryStore();
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize });
    const written = config.write({ name: 'a' });
    expect(written).toEqual({ name: 'a', limit: 5 });
    expect(store.file()).toEqual({ name: 'a', limit: 5 });
  });

  it('★ 写不合法：当场抛，不落盘', () => {
    const store = memoryStore();
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize });
    expect(() => config.write(null)).toThrowError('不是一份配置');
    expect(store.file()).toBeNull();
  });

  it('★ 清空：下次读回兜底', () => {
    const store = memoryStore();
    const config = createUnitConfig({ store, file: 'config.json', fallback: FALLBACK, normalize });
    config.write({ name: 'a' });
    config.reset();
    expect(config.read()).toEqual(FALLBACK);
  });
});
