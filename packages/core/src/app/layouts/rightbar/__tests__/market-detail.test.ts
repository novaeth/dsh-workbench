import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import type { MarketRow } from '../market-row-types';
import { MarketDetail } from '../market-detail';

const t = ((key: string) => key) as Translate;

const ROW: MarketRow = {
  id: 'hello',
  titleKey: 'hello.title',
  state: 'installed',
  canInstall: false,
  canUpdate: false,
  canUninstall: true,
  pkg: '@a/hello',
  spec: '^0.1.2',
  registry: 'https://r.example/team/',
  version: { installed: '0.1.2' },
};

function texts(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    for (const item of node) texts(item, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  const element = node as { props?: Record<string, unknown> };
  const props = element.props;
  if (props === undefined) return out;
  const children = props['children'];
  for (const child of Array.isArray(children) ? children : [children]) {
    if (typeof child === 'string') out.push(child);
    else texts(child, out);
  }
  return out;
}

describe('模块 / 插件详情页：dsh 插件详情页那套（面包屑 · 标题 · 包名 · 来源信息）', () => {
  it('★ 标题、包名、状态、来源与版本都摆得出来', () => {
    const tree = MarketDetail({
      t,
      row: ROW,
      pending: null,
      failure: null,
      notice: null,
      onBack: () => undefined,
      onRequest: () => undefined,
      onRecheck: () => undefined,
      rechecking: false,
    });
    const shown = texts(tree);

    expect(shown).toContain('panels.market.detailBack');
    expect(shown).toContain('hello.title');
    expect(shown).toContain('@a/hello');
    expect(shown).not.toContain('panels.market.installed');
    expect(shown).toContain('panels.market.detailSourceTitle');
    expect(shown).toContain('panels.market.detailSource');
    expect(shown).toContain('https://r.example/team/');
    expect(shown).toContain('panels.market.detailSpec');
    expect(shown).toContain('panels.market.detailUnit');
    expect(shown).toContain('hello');
    expect(shown).toContain('panels.market.detailVersion');
    expect(shown).toContain('0.1.2');
  });

  it('★ 本地那份拿不到目录时，安装源退回「本机目录」', () => {
    const tree = MarketDetail({
      t,
      row: { ...ROW, pkg: '/Users/me/my-plugin', spec: undefined, registry: undefined, local: true },
      pending: null,
      failure: null,
      notice: null,
      onBack: () => undefined,
      onRequest: () => undefined,
      onRecheck: () => undefined,
      rechecking: false,
    });
    const shown = texts(tree);

    expect(shown).toContain('panels.market.localMark');
    expect(shown).toContain('/Users/me/my-plugin');
    expect(shown).toContain('panels.market.detailLocalDirectory');
  });
});
