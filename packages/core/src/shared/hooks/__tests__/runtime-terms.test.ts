import { describe, expect, it } from 'vitest';
import { zh } from '@dsh-workbench/shared';
import { runtimeTermsOf } from '../runtime-terms';

const t = ((key: string) => (zh as Record<string, string>)[key] ?? key) as never;

describe('没有适配器档案时用词表兜底', () => {
  it('拿到的就是词表里那四个术语，句子渲染结果不变', () => {
    expect(runtimeTermsOf(t)).toEqual({
      plugin: zh['runtime.plugin'],
      pluginOf: zh['runtime.pluginOf'],
      pluginThing: zh['runtime.pluginThing'],
      pluginArea: zh['runtime.pluginArea'],
    });
  });
});
