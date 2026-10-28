import { describe, expect, it } from 'vitest';
import type { Translate } from '@dsh-workbench/shared';
import { MarketBody } from '../MarketView';

const t = ((key: string) => key) as Translate;

function render(runtimePluginMarket: boolean | undefined): string[] {
  const tree = MarketBody({
    t,
    runtimePluginMarket,
    self: undefined,
    shown: [],
    pluginList: [],
    installedList: [],
    shared: [],
    pending: null,
    failed: null,
    notice: null,
    act: async () => undefined,
    onConfirming: () => undefined,
    setDefault: async () => undefined,
    boardBusy: false,
    checks: { modules: null, plugins: null },
    onRecheck: () => undefined,
    rechecking: false,
  });
  return titles(tree as never);
}

function titles(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    for (const item of node) titles(item, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  const element = node as { props?: Record<string, unknown> };
  const props = element.props;
  if (props === undefined) return out;
  const titleKey = props['titleKey'];
  if (typeof titleKey === 'string') out.push(titleKey);
  titles(props['children'], out);
  return out;
}

describe('运行时能力决定插件分区出不出来', () => {
  it('适配器没有插件市场（pluginMarket=false）→ 分区整个不渲染', () => {
    expect(render(false)).not.toContain('panels.market.sectionPlugins');
  });

  it('有插件市场 → 分区在（这一条保证上面的断言不是恒真）', () => {
    expect(render(true)).toContain('panels.market.sectionPlugins');
  });

  it('能力还没读到（undefined）→ 照旧显示，不闪', () => {
    expect(render(undefined)).toContain('panels.market.sectionPlugins');
  });
});
