import { describe, expect, it } from 'vitest';
import { formatBytes, overviewStateOf } from '../overview';

describe('overviewStateOf', () => {
  it('待机就是待机', () => {
    expect(overviewStateOf({ phase: 'idle', value: undefined, error: undefined })).toEqual({ kind: 'idle' });
  });

  it('还在读、又没有旧值，就是加载那一屏', () => {
    expect(overviewStateOf({ phase: 'loading', value: undefined, error: undefined })).toEqual({ kind: 'loading' });
  });

  it('读到了、还有东西，就是就绪', () => {
    const payload = { path: '/p', files: 2, dirs: 1, bytes: 10, largest: [] };
    const value = { ok: true as const, ...payload };
    expect(overviewStateOf({ phase: 'ready', value, error: undefined })).toEqual({ kind: 'ready', payload: value });
  });

  it('读到了但两个数都是零就是空态', () => {
    const payload = { path: '/tmp', files: 0, dirs: 0, bytes: 0, largest: [] };
    const value = { ok: true as const, ...payload };
    expect(overviewStateOf({ phase: 'ready', value, error: undefined })).toEqual({ kind: 'empty', payload: value });
  });

  it('出错时把 code 与 message 拼成 detail', () => {
    const state = overviewStateOf({
      phase: 'error',
      value: undefined,
      error: { code: 'network', message: '宿主没有响应' },
    });
    expect(state).toEqual({ kind: 'error', detail: 'network: 宿主没有响应' });
  });

  it('刷新时旧值还在：继续画旧数据，不退回加载态', () => {
    const payload = { path: '/p', files: 3, dirs: 1, bytes: 100, largest: [] };
    const value = { ok: true as const, ...payload };
    expect(overviewStateOf({ phase: 'loading', value, error: undefined })).toEqual({ kind: 'ready', payload: value });
  });
});

describe('formatBytes', () => {
  it('四档单位', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(12)).toBe('12 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(formatBytes(4 * 1024 * 1024 * 1024)).toBe('4.0 GB');
  });
});
