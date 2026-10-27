import { describe, expect, it } from 'vitest';
import { asArgs } from '../host-args';

describe('host-args', () => {
  it('asArgs 只认对象，其余一律给空对象', () => {
    const obj = { a: 1 };
    expect(asArgs(obj)).toBe(obj);
    expect(asArgs(null)).toEqual({});
    expect(asArgs(undefined)).toEqual({});
    expect(asArgs('x')).toEqual({});
    expect(asArgs([1, 2])).toEqual([1, 2]);
  });
});
