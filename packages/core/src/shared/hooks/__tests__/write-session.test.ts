import { describe, expect, it } from 'vitest';
import { writeBodyWithSession } from '../write-session';

describe('动作写带上当前会话', () => {
  it('动作通道：会话附在请求体里，原来的字段一个不少', () => {
    expect(writeBodyWithSession('actions', { unit: 'hello' }, 's-1')).toEqual({ unit: 'hello', session: 's-1' });
  });

  it('动作通道但没有会话：原样发', () => {
    expect(writeBodyWithSession('actions', { unit: 'hello' }, undefined)).toEqual({ unit: 'hello' });
  });

  it('别的通道不塞会话（prefs / provision 只认自己的字段）', () => {
    expect(writeBodyWithSession('prefs', { unit: 'hello' }, 's-1')).toEqual({ unit: 'hello' });
    expect(writeBodyWithSession('provision', { action: 'unit', unit: 'hello' }, 's-1')).toEqual({
      action: 'unit',
      unit: 'hello',
    });
  });
});
