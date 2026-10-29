import { describe, expect, it } from 'vitest';
import type { AdapterSet } from '@dsh-workbench/shared/host';
import { WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';
import { fakeAdapterSet } from '@dsh-workbench/shared/testing';
import { surfaceOf } from '../runtime-surface';

function ctxWith(set: AdapterSet | undefined): never {
  return { get: (key: string) => (key === WORKBENCH_ADAPTERS ? set : undefined) } as never;
}

describe('运行时的命令面：有就给，没有就是没有', () => {
  it('适配器给了 ⇒ 原样拿到', () => {
    const surface = surfaceOf(ctxWith(fakeAdapterSet()));
    expect(surface?.name).toBe('fake');
    expect(surface?.invoke('site', 'cmd')).toBe('fake site cmd');
  });

  it('适配器没给 ⇒ undefined（不许编一份出来）', () => {
    const base = fakeAdapterSet();
    const set: AdapterSet = {
      ...base,
      runtime: { ...base.runtime, commandSurface: () => undefined },
    };
    expect(surfaceOf(ctxWith(set))).toBeUndefined();
    expect(surfaceOf(ctxWith(undefined))).toBeUndefined();
  });
});
