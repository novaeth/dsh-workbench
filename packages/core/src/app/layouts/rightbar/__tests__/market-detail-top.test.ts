import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import { MarketDetailTop } from '../market-detail-top';

const t = ((key: string) => key) as Translate;

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

describe('详情页顶部：面包屑 + 图标 + 标题区 + 右侧操作位', () => {
  it('★ 面包屑用「市场」、图标与标题区、操作位都摆进同一块', () => {
    const tree = MarketDetailTop({
      t,
      onBack: () => undefined,
      icon: 'ARTWORK',
      children: 'MAIN',
      end: 'END',
    });
    const shown = texts(tree);

    expect(shown).toContain('panels.market.detailBack');
    expect(shown).toContain('ARTWORK');
    expect(shown).toContain('MAIN');
    expect(shown).toContain('END');
  });
});
