import { describe, expect, it } from 'vitest';
import { apply, inject, name } from '../host';

describe('module-fixture', () => {
  it('声明成 workbenchUnits 的单位模块', () => {
    expect(name).toBe('@dsh-workbench/module-fixture');
    expect(inject).toEqual(['workbenchUnits']);
    expect(typeof apply).toBe('function');
  });
});
