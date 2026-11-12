import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import type { SharedRow } from '../market-shared-rows';
import { SharedDetail } from '../market-shared-detail';

const t = ((key: string) => key) as Translate;

const ROW: SharedRow = {
  id: 'extension:coding',
  kind: 'extension',
  label: 'opencli-plugin-coding',
  usedByKeys: ['coding-analysis.title', 'coding-issues.title'],
  state: 'outdated',
  canUpdate: true,
  version: { installed: '1.0.52', latest: '1.0.53' },
  source: {
    kind: 'npm',
    text: 'opencli-plugin-coding',
    code: true,
    registry: 'https://registry.invalid/team/',
  },
};

type Element = {
  readonly type?: unknown;
  readonly props?: Record<string, unknown>;
};

function texts(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    for (const item of node) texts(item, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  const element = node as Element;
  const props = element.props;
  if (props === undefined) return out;
  const children = props['children'];
  for (const child of Array.isArray(children) ? children : [children]) {
    if (typeof child === 'string') out.push(child);
    else texts(child, out);
  }
  if (typeof element.type === 'function') {
    const render = element.type as (props: Record<string, unknown>) => unknown;
    texts(render(props), out);
  }
  return out;
}

describe('共用依赖详情页：面包屑 · 名称 · 版本 · 依赖信息', () => {
  it('★ 名称、版本、状态、类型、使用模块与更新按钮都摆得出来', () => {
    const tree = SharedDetail({
      t,
      row: ROW,
      pending: null,
      failure: null,
      onBack: () => undefined,
      onAct: () => undefined,
      onRecheck: () => undefined,
      rechecking: false,
    });
    const shown = texts(tree);

    expect(shown).toContain(ROW.label);
    expect(shown).toContain('1.0.52');
    expect(shown).toContain('panels.market.sharedOutdated');
    expect(shown).toContain('panels.market.detailSharedTitle');
    expect(shown).toContain('panels.market.detailKind');
    expect(shown).toContain('panels.market.sharedKindPlugin');
    expect(shown).toContain('panels.market.detailVersion');
    expect(shown).toContain('1.0.52');
    expect(shown).toContain('panels.market.detailLatest');
    expect(shown).toContain('1.0.53');
    expect(shown).toContain('panels.market.detailSource');
    expect(shown).toContain('https://registry.invalid/team/');
    expect(shown).not.toContain('panels.market.detailRegistry');
    expect(shown).toContain('opencli-plugin-coding');
    expect(shown).toContain('panels.market.detailSharedUsedBy');
    const usedBy = shown.find((item) => item.includes('coding-analysis.title')) ?? '';
    expect(usedBy).toContain('coding-issues.title');
    expect(shown).toContain('panels.market.update');
  });

  it('★ 已就绪且没有更新动作时不摆更新按钮', () => {
    const tree = SharedDetail({
      t,
      row: { ...ROW, state: 'installed', canUpdate: false, version: { installed: '1.0.53' } },
      pending: null,
      failure: null,
      onBack: () => undefined,
      onAct: () => undefined,
      onRecheck: () => undefined,
      rechecking: false,
    });
    const shown = texts(tree);

    expect(shown).not.toContain('panels.market.update');
    expect(shown).not.toContain('panels.market.sharedOk');
    expect(shown).toContain('panels.market.sharedKindPlugin');
    expect(shown).not.toContain('panels.market.detailLatest');
  });

  it('★ 库类依赖写「库」，正在更新时说进度', () => {
    const tree = SharedDetail({
      t,
      row: { ...ROW, id: 'lib:workflow', kind: 'lib', label: 'opencli-workflow', state: 'installed', canUpdate: false },
      pending: { id: 'lib:workflow', action: 'update-dependency' },
      failure: null,
      onBack: () => undefined,
      onAct: () => undefined,
      onRecheck: () => undefined,
      rechecking: false,
    });
    const shown = texts(tree);

    expect(shown).toContain('panels.market.sharedKindLib');
    expect(shown).toContain('panels.market.updating');
    expect(shown).not.toContain('panels.market.update');
  });
});

describe('共用依赖详情页：跟发现页同一套 tab 与本地包元数据', () => {
  it('★ 概览 / 说明 / 更新日志三格都在，元数据摆进依赖信息', () => {
    const tree = SharedDetail({
      t,
      row: ROW,
      pending: null,
      failure: null,
      onBack: () => undefined,
      onAct: () => undefined,
      onRecheck: () => undefined,
      rechecking: false,
      info: {
        pkg: 'opencli-plugin-coding',
        version: '1.0.52',
        description: '编码插件',
        author: '张三',
        homepage: 'https://example.com/coding',
        keywords: ['opencli', 'coding'],
      },
    });
    const shown = texts(tree);

    expect(shown).toContain('panels.market.detailTabOverview');
    expect(shown).toContain('panels.market.detailTabReadme');
    expect(shown).toContain('panels.market.detailTabChangelog');
    expect(shown).toContain('编码插件');
    expect(shown).toContain('张三');
    expect(shown).toContain('panels.market.detailKeywords');
    expect(shown).toContain('opencli');
  });
});
