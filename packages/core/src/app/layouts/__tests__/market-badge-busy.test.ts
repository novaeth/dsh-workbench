import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8');

describe('左栏那枚徽标：更新跑着的那一单元不许点亮（接线判据）', () => {
  it('★ 市场页发的就是行快照那同一个 id（不是照行状态另算一份）', () => {
    const view = read('rightbar/MarketView.tsx');

    expect(view).toContain('const busyId = heldIdOf(pending, steady.held);');
    expect(view).toContain('usePublishMarketBusy(busyId);');
    expect(read('rightbar/market-busy.ts')).toContain(
      'publishMarketBusy(id === null ? [] : [id]);',
    );
  });

  it('★ 入口那枚徽标读数带上这份事实（漏传 = 判据白写）', () => {
    const panel = read('market/panel.tsx');

    expect(panel).toContain('const busy = useMarketBusy();');
    expect(panel).toMatch(/marketHintOf\(\{[\s\S]*?\bbusy,/);
  });

  it('★ 发布方与读取方是同一份事实（各自造集合 = 会漂的第二份口径）', () => {
    const busy = read('rightbar/market-busy.ts');

    expect(busy).toContain('export function publishMarketBusy');
    expect(busy).toContain('export function useMarketBusy');
  });
});
