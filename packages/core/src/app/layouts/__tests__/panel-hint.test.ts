import { describe, expect, it } from 'vitest';
import { zh } from '@dsh-workbench/shared';
import { panelHintOf, panelRowName, publishPanelHint, subscribePanelHints } from '../panel-hint';

const t = (key: string, params?: Record<string, unknown>): string => {
  let text = (zh as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) text = text.replace(`{${name}}`, String(value));
  return text;
};

describe('panel-hint', () => {
  it('发布一条 → 订阅者收到一次，读得回那一条', () => {
    const id = 'unit-test/publish';
    let hits = 0;
    const off = subscribePanelHints(() => (hits += 1));

    publishPanelHint(id, { labelKey: 'panels.market.hasNew', tone: 'warning' });

    expect(hits).toBe(1);
    expect(panelHintOf(id)).toEqual({ labelKey: 'panels.market.hasNew', tone: 'warning' });
    off();
    publishPanelHint(id, null);
  });

  it('★ 同一条说法再发一遍 → 不通知（市场每次探测落地都会发，左栏不该跟着重画）', () => {
    const id = 'unit-test/same';
    let hits = 0;
    const off = subscribePanelHints(() => (hits += 1));

    publishPanelHint(id, { labelKey: 'panels.market.hasNew', tone: 'warning' });
    publishPanelHint(id, { labelKey: 'panels.market.hasNew', tone: 'warning' });

    expect(hits).toBe(1);
    off();
    publishPanelHint(id, null);
  });

  it('★ 整条一样（第二句也逐字相同）→ 不通知', () => {
    const id = 'unit-test/same-more';
    let hits = 0;
    const off = subscribePanelHints(() => (hits += 1));

    publishPanelHint(id, {
      labelKey: 'panels.market.hasProblem',
      tone: 'danger',
      moreKeys: ['panels.market.hasNew'],
    });
    publishPanelHint(id, {
      labelKey: 'panels.market.hasProblem',
      tone: 'danger',
      moreKeys: ['panels.market.hasNew'],
    });

    expect(hits).toBe(1);
    off();
    publishPanelHint(id, null);
  });

  it('★ 同一句话、tone 变了 → 要通知（异常压过新版 / 新版退成异常都得重画）', () => {
    const id = 'unit-test/tone';
    let hits = 0;
    const off = subscribePanelHints(() => (hits += 1));

    publishPanelHint(id, { labelKey: 'panels.market.hasNew', tone: 'warning' });
    publishPanelHint(id, { labelKey: 'panels.market.hasNew', tone: 'danger' });

    expect(hits).toBe(2);
    expect(panelHintOf(id)).toEqual({ labelKey: 'panels.market.hasNew', tone: 'danger' });
    off();
    publishPanelHint(id, null);
  });

  it('★ 第二句变了 → 要通知（名字里那半句得跟上）', () => {
    const id = 'unit-test/more-keys';
    let hits = 0;
    const off = subscribePanelHints(() => (hits += 1));

    publishPanelHint(id, { labelKey: 'panels.market.hasProblem', tone: 'danger' });
    publishPanelHint(id, {
      labelKey: 'panels.market.hasProblem',
      tone: 'danger',
      moreKeys: ['panels.market.hasNew'],
    });

    expect(hits).toBe(2);
    off();
    publishPanelHint(id, null);
  });

  it('撤销之后读回 null，订阅者也收到一次（标签得能灭）', () => {
    const id = 'unit-test/clear';
    let hits = 0;
    const off = subscribePanelHints(() => (hits += 1));

    publishPanelHint(id, { labelKey: 'panels.market.hasNew', tone: 'warning' });
    publishPanelHint(id, null);

    expect(hits).toBe(2);
    expect(panelHintOf(id)).toBeNull();
    off();
  });

  it('没人发布过的面板没有提示；「回到对话」那一行（id 为 null）永远没有', () => {
    expect(panelHintOf('unit-test/never-published')).toBeNull();
    expect(panelHintOf(null)).toBeNull();
  });

  it('退订之后不再收到', () => {
    const id = 'unit-test/unsubscribe';
    let hits = 0;
    const off = subscribePanelHints(() => (hits += 1));

    off();
    publishPanelHint(id, { labelKey: 'panels.market.hasNew', tone: 'warning' });

    expect(hits).toBe(0);
    publishPanelHint(id, null);
  });
});

describe('panelRowName', () => {
  it('★ 有提示 → 名字里带上那句话（标签说不出来，名字得说）', () => {
    const name = panelRowName('工作台模块市场', { labelKey: 'panels.market.hasNew', tone: 'warning' }, t);

    expect(name).toContain('工作台模块市场');
    expect(name).toContain('有新版本');
  });

  it('★ 只有一句时不多出分隔符', () => {
    expect(panelRowName('工作台模块市场', { labelKey: 'panels.market.hasNew', tone: 'warning' }, t)).toBe(
      '工作台模块市场（有新版本）',
    );
  });

  it('★ 两件都真 → 第二句也在名字里，用 hintJoin 连起来', () => {
    expect(
      panelRowName(
        '工作台模块市场',
        { labelKey: 'panels.market.hasProblem', tone: 'danger', moreKeys: ['panels.market.hasNew'] },
        t,
      ),
    ).toBe('工作台模块市场（模块异常；有新版本）');
  });

  it('第二句不止一条 → 逐条译、逐条连', () => {
    expect(
      panelRowName(
        '工作台模块市场',
        {
          labelKey: 'panels.market.hasProblem',
          tone: 'danger',
          moreKeys: ['panels.market.hasNew', 'panels.market.hasNew'],
        },
        t,
      ),
    ).toBe('工作台模块市场（模块异常；有新版本；有新版本）');
  });

  it('没提示 → 名字就是面板自己的名字（不多出括号）', () => {
    expect(panelRowName('工作台模块市场', null, t)).toBe('工作台模块市场');
  });
});
