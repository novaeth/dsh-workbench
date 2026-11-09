import { describe, expect, it } from 'vitest';
import type { CardView } from '../board-module.js';
import { cardViewProblemsOf } from '../card-view-validate.js';

const view: CardView = {
  version: 1,
  titleKey: 'inventory.title',
  platform: { href: 'https://example.test', labelKey: 'inventory.platform' },
  read: { route: 'inventory/summary', map: () => ({ phase: 'empty', hintKey: 'inventory.empty' }) },
  sections: { metrics: () => [] },
  settings: {
    gearKey: 'inventory.settings',
    titleKey: 'inventory.settings',
    fields: [{ kind: 'select', key: 'env', labelKey: 'inventory.env', options: [] }],
    values: () => ({}),
    save: { route: 'inventory/config', body: (values) => values },
    labels: {
      cancelKey: 'inventory.cancel',
      saveKey: 'inventory.save',
      savingKey: 'inventory.saving',
      failedKey: 'inventory.failed',
    },
  },
  actions: [{ kind: 'retry', labelKey: 'inventory.retry' }],
  custom: () => null,
};

describe('cardViewProblemsOf', () => {
  it('完整的 v1 view 没有原因', () => {
    expect(cardViewProblemsOf(view)).toEqual([]);
  });

  it('不是对象、版本不对、缺 titleKey / read', () => {
    expect(cardViewProblemsOf(null)).toEqual(['CardView 必须是对象']);
    expect(cardViewProblemsOf({ ...view, version: 2 })).toContain('CardView.version 必须是 1');
    expect(cardViewProblemsOf({ ...view, titleKey: '' })).toContain('titleKey 必须是非空字符串');
    expect(cardViewProblemsOf({ ...view, read: undefined })).toContain('read 必须是对象');
    expect(cardViewProblemsOf({ ...view, read: { ...view.read, route: '' } })).toContain(
      'read.route 必须是非空字符串',
    );
    expect(cardViewProblemsOf({ ...view, customBody: true } as unknown)).toContain(
      'customBody 必须是函数',
    );
    expect(cardViewProblemsOf({ ...view, customLongTask: true } as unknown)).toContain(
      'customLongTask 必须是函数',
    );
  });

  it('拼错的 section、不是函数的 section 都点名', () => {
    const typo = { ...view, sections: { rows: () => [], metrcs: () => [] } } as unknown;
    expect(cardViewProblemsOf(typo)).toContain('不认识的 section：metrcs');

    const notFn = { ...view, sections: { metrics: [] } } as unknown;
    expect(cardViewProblemsOf(notFn)).toContain('sections.metrics 必须是函数');
  });

  it('settings 的字段、保存与文案缺一不可', () => {
    const badField = {
      ...view,
      settings: { ...view.settings, fields: [{ kind: 'select', key: 'env' }] },
    } as unknown;
    expect(cardViewProblemsOf(badField)).toContain(
      'settings.fields[0].labelKey 必须是非空字符串',
    );

    const badSave = { ...view, settings: { ...view.settings, save: { route: '' } } } as unknown;
    expect(cardViewProblemsOf(badSave)).toContain('settings.save.route 必须是非空字符串');

    const badLabels = {
      ...view,
      settings: { ...view.settings, labels: { ...view.settings?.labels, failedKey: '' } },
    } as unknown;
    expect(cardViewProblemsOf(badLabels)).toContain(
      'settings.labels.failedKey 必须是非空字符串',
    );
  });

  it('select 字段可以交 options / optionsOf / load，load 要有 route 与 pick', () => {
    const noOptions = {
      ...view,
      settings: {
        ...view.settings,
        fields: [{ kind: 'select', key: 'team', labelKey: 'team' }],
      },
    } as unknown;
    expect(cardViewProblemsOf(noOptions)).toContain(
      'settings.fields[0] 要有 options / optionsOf / load',
    );

    const loaded = {
      ...view,
      settings: {
        ...view.settings,
        fields: [
          {
            kind: 'select',
            key: 'team',
            labelKey: 'team',
            load: { route: 'team/options', pick: () => [] },
          },
        ],
      },
    } as unknown;
    expect(cardViewProblemsOf(loaded)).toEqual([]);

    const badLoad = {
      ...view,
      settings: {
        ...view.settings,
        fields: [{ kind: 'select', key: 'team', labelKey: 'team', load: { route: '' } }],
      },
    } as unknown;
    expect(cardViewProblemsOf(badLoad)).toContain(
      'settings.fields[0].load.route 必须是非空字符串',
    );
    expect(cardViewProblemsOf(badLoad)).toContain(
      'settings.fields[0].load.pick 必须是函数',
    );
  });

  it('platformOf / refreshMs / 行尾时间都是可选增量', () => {
    expect(cardViewProblemsOf({ ...view, platformOf: () => undefined, refreshMs: 120000 })).toEqual([]);
    expect(cardViewProblemsOf({ ...view, meta: () => '3' })).toEqual([]);
    expect(cardViewProblemsOf({ ...view, meta: 1 })).toContain('meta 必须是函数');
    expect(cardViewProblemsOf({ ...view, platformOf: 1 })).toContain('platformOf 必须是函数');
    expect(cardViewProblemsOf({ ...view, refreshMs: 0 })).toContain('refreshMs 必须是正数');
  });

  it('动作认 open-url / retry / chat，open-url 必须有 href，chat 必须有 chip', () => {
    const badKind = { ...view, actions: [{ kind: 'run', labelKey: 'x' }] } as unknown;
    expect(cardViewProblemsOf(badKind)).toContain(
      'actions[0].kind 只支持 open-url / retry / chat',
    );

    const noHref = { ...view, actions: [{ kind: 'open-url', labelKey: 'x' }] } as unknown;
    expect(cardViewProblemsOf(noHref)).toContain('actions[0].href 必须是非空字符串');

    const chat = {
      ...view,
      actions: [{ kind: 'chat', label: '让 agent 看', chip: { kind: 'inventory', parts: ['a'] } }],
    } as unknown;
    expect(cardViewProblemsOf(chat)).toEqual([]);
  });
});
