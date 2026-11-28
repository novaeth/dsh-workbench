import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Translate } from '@dsh-workbench/shared';
import { dictionaries } from '@dsh-workbench/shared';
import type { MarketAct } from '../market-act';
import type { MarketRow } from '../market-row-types';
import { workbenchRow } from '../market-workbench-row';
import { MarketBody } from '../market-body';

const CORE = '@dsh-workbench/core';

const t: Translate = (key, params) => {
  const text = (dictionaries.zh as Record<string, string>)[key] ?? key;
  if (params === undefined) return text;
  return Object.keys(params).reduce(
    (out, name) => out.replaceAll(`{${name}}`, String(params[name])),
    text,
  );
};

const act: MarketAct = Object.assign(async () => undefined, { many: async () => undefined });

const SELF = workbenchRow({ pkg: CORE, installed: '1.5.6' });

function render(installedList: readonly MarketRow[], onBuildModule?: () => void): string {
  return renderToStaticMarkup(
    h(MarketBody, {
      t,
      self: SELF,
      shown: [],
      pluginList: [],
      installedList,
      pending: null,
      failed: null,
      notice: null,
      act,
      onConfirming: () => undefined,
      setDefault: async () => undefined,
      boardBusy: false,
      checks: { modules: null, plugins: null },
      onRecheck: () => undefined,
      rechecking: false,
      ...(onBuildModule === undefined ? {} : { onBuildModule }),
    }),
  );
}

describe('市场空态下的「创建模块」', () => {
  it('★ 示例提示词在词典里（词典漏了就会把 key 原样塞进输入框）', () => {
    expect(dictionaries.zh['panels.createPrompt']).toBeTruthy();
    expect(dictionaries.en['panels.createPrompt']).toBeTruthy();
  });

  it('★ 一个模块都没有：工作台行下面给空态与创建入口', () => {
    const html = render([], () => undefined);

    expect(html).toContain('还没有安装模块');
    expect(html).toContain('wb-centeredAction');
  });

  it('已装行在时不出现空态', () => {
    const row = workbenchRow({ pkg: CORE, installed: '1.5.6' });
    const html = render(row === undefined ? [] : [row], () => undefined);

    expect(html).not.toContain('还没有安装模块');
  });

  it('没给创建入口时只留一句话，不出按钮', () => {
    const html = render([]);

    expect(html).toContain('还没有安装模块');
    expect(html).not.toContain('wb-centeredAction');
  });
});
