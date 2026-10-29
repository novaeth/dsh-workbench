import { describe, expect, it, vi } from 'vitest';
import { zh } from '@dsh-workbench/shared';
import { runtimeTermsOf } from '../runtime-terms';

const profile = vi.hoisted(() => ({ value: undefined as unknown }));

vi.mock('../use-runtime-capabilities', () => ({
  runtimeProfileValue: () => profile.value,
}));

const t = ((key: string) => (zh as Record<string, string>)[key] ?? key) as never;

describe('运行时术语：有档案就用档案的，没有才落词表', () => {
  it('没有档案 ⇒ 词表里那四个术语（不点名任何运行时）', () => {
    profile.value = undefined;
    expect(runtimeTermsOf(t)).toEqual({
      plugin: zh['runtime.plugin'],
      pluginOf: zh['runtime.pluginOf'],
      pluginThing: zh['runtime.pluginThing'],
      pluginArea: zh['runtime.pluginArea'],
    });
  });

  it('有档案 ⇒ 四个槽全换成适配器给的那份', () => {
    profile.value = {
      label: 'fake',
      terms: {
        plugin: { zh: '仿制插件', en: 'fake plugin' },
        pluginOf: { zh: '仿制的插件', en: 'a fake plugin' },
        pluginThing: { zh: '仿制插件', en: 'a fake plugin' },
        pluginArea: { zh: '仿制的插件区', en: 'the fake plugin area' },
      },
      installHint: { zh: '无', en: 'nothing' },
      diagnose: {},
    };

    expect(runtimeTermsOf(t)).toEqual({
      plugin: '仿制插件',
      pluginOf: '仿制的插件',
      pluginThing: '仿制插件',
      pluginArea: '仿制的插件区',
    });
  });
});
