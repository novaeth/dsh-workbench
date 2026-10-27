import { describe, expect, it } from 'vitest';
import { resourceViewOf } from '../resource-view';

describe('存下来的那一态只属于产出它的身份', () => {
  const ready = { phase: 'ready' as const, value: { ok: true }, at: 7 };

  it('★ 身份对得上：就是存下来的那一态（同一份对象，不另造）', () => {
    expect(resourceViewOf(true, { identity: 'a', state: ready }, 'a')).toBe(ready);
  });

  it('★ 身份对不上：给 loading，不许把上一次读的值先露一帧（停用期间换了工作区就是它）', () => {
    expect(resourceViewOf(true, { identity: 'a', state: ready }, 'b')).toEqual({ phase: 'loading' });
  });

  it('★ 停用：恒为 idle，存着什么都不露', () => {
    expect(resourceViewOf(false, { identity: 'a', state: ready }, 'a')).toEqual({ phase: 'idle' });
    expect(resourceViewOf(false, { identity: 'a', state: ready }, 'b')).toEqual({ phase: 'idle' });
  });

  it('存下来的是 error：身份对得上就照给（错不许被 loading 盖掉）', () => {
    const failed = { phase: 'error' as const, error: { code: 'network', message: '断了' } };
    expect(resourceViewOf(true, { identity: 'a', state: failed }, 'a')).toBe(failed);
    expect(resourceViewOf(true, { identity: 'a', state: failed }, 'b')).toEqual({ phase: 'loading' });
  });
});
