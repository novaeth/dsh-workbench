import { describe, expect, it } from 'vitest';
import { marketActions } from '../market-rows';
import { ACTION_LABEL_KEY, UPDATE_ACTIONS } from '../market-view-text';
import type { MarketRow } from '../market-row-types';

function rowOf(overrides: Record<string, unknown>): MarketRow {
  return { id: 'mcp', titleKey: 'mcp.title', state: 'installed', ...overrides } as unknown as MarketRow;
}

describe('「更新」的颜色口径跟着文案走', () => {
  it('凡是文案写「更新」的动作都在更新色名单里', () => {
    for (const action of Object.keys(ACTION_LABEL_KEY) as (keyof typeof ACTION_LABEL_KEY)[]) {
      if (ACTION_LABEL_KEY[action] === 'panels.market.update') {
        expect(UPDATE_ACTIONS, action).toContain(action);
      }
    }
  });

  it('有新版、但要走「装指定版本」的那一行：动作是 install-version，它必须带更新色', () => {
    const actions = marketActions(
      rowOf({
        canUpdate: true,
        canUninstall: true,
        moduleUpdate: { latest: '0.1.3' },
        market: { registry: 'x', spec: 'mcp@0.1.3' },
        pkg: 'mcp',
      }),
    );

    expect(actions).toContain('install-version');
    expect(ACTION_LABEL_KEY['install-version']).toBe('panels.market.update');
    expect(UPDATE_ACTIONS).toContain('install-version');
  });
});
