import { describe, expect, it } from 'vitest';
import type { MarketRow } from '../market-rows';
import { confirmActionOf } from '../market-confirm';

describe('市场确认弹窗确认的是哪个动作', () => {
  it('★ 工作台有可回退的上一版时，确认后执行的是切回上一版', () => {
    expect(confirmActionOf({ canRollback: true } as MarketRow)).toBe('rollback-workbench');
  });

  it('★ 插件 / 套件 / 模块各自落回自己的卸载动作，空行不猜', () => {
    expect(confirmActionOf({ plugin: true } as MarketRow)).toBe('uninstall-plugin');
    expect(confirmActionOf({ removeViaBundle: true } as MarketRow)).toBe('remove-bundle');
    expect(confirmActionOf({} as MarketRow)).toBe('uninstall');
    expect(confirmActionOf(undefined)).toBe('uninstall');
  });
});
