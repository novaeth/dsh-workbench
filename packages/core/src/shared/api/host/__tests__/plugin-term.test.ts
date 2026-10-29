import { describe, expect, it } from 'vitest';
import type { AdapterSet } from '@dsh-workbench/shared/host';
import { WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';
import { fakeAdapterSet } from '@dsh-workbench/shared/testing';
import { pluginTermOf } from '../plugin-term';

function ctxWith(set: AdapterSet | undefined): never {
  return {
    get: (key: string) => (key === WORKBENCH_ADAPTERS ? set : undefined),
  } as never;
}

describe('给 agent 的那句话里，插件叫什么', () => {
  it('适配器说了就用它的词', () => {
    const set = fakeAdapterSet({
      runtime: {
        ...fakeAdapterSet().runtime,
        profile: () => ({
          label: 'fake',
          terms: {
            plugin: { zh: '仿制插件', en: 'fake plugin' },
            pluginOf: { zh: '仿制的插件', en: 'a fake plugin' },
            pluginThing: { zh: '仿制插件', en: 'a fake plugin' },
            pluginArea: { zh: '仿制的插件区', en: 'the fake plugin area' },
          },
          installHint: { zh: '无', en: 'nothing' },
          diagnose: {},
        }),
      },
    });

    expect(pluginTermOf(ctxWith(set))).toBe('仿制插件');
  });

  it('拿不到适配器 ⇒ 退到中性词（不点名任何运行时）', () => {
    expect(pluginTermOf(ctxWith(undefined))).toBe('插件');
  });
});
