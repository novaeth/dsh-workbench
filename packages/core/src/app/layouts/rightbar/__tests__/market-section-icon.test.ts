import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { marketSectionIcon, type MarketSectionKind } from '../market-section-icon';

const KINDS: readonly MarketSectionKind[] = ['installed', 'pending', 'plugins', 'shared'];

function typeOf(kind: MarketSectionKind): unknown {
  return (marketSectionIcon(kind) as { type?: unknown }).type;
}

describe('市场每段的类型图标', () => {
  it('★ 每一种类型一枚，且互不相同（不然"不同类型的图标不同"就白说了）', () => {
    const types = KINDS.map(typeOf);

    for (const [index, type] of types.entries()) expect(type, KINDS[index]).toBeTruthy();
    expect(new Set(types).size).toBe(KINDS.length);
  });

  it('四枚一样大（段标题那行里不许有大有小）', () => {
    for (const kind of KINDS) {
      expect((marketSectionIcon(kind) as { props?: { size?: number } }).props?.size, kind).toBe(14);
    }
  });

  it('★ 有段头的都配了图标、没段头的那一条（工作台自己）不配（哪天漏配就红）', () => {
    const view = readFileSync(new URL('../MarketView.tsx', import.meta.url), 'utf8');
    const blocks = view
      .split('<MarketSection')
      .slice(1)
      .map((part) => part.split('/>')[0] ?? '');

    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      if (!block.includes('titleKey=')) {
        expect(block, block.slice(0, 60)).not.toContain('marketSectionIcon(');
        continue;
      }
      expect(block, block.slice(0, 60)).toContain('icon={marketSectionIcon(');
    }
    expect(readFileSync(new URL('../SharedSection.tsx', import.meta.url), 'utf8')).toContain(
      "marketSectionIcon('shared')",
    );
  });
});
