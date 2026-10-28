import { describe, expect, it } from 'vitest';
import type { MarketIndex } from '../../contract/protocol/market-index.js';
import { assembleMarketIndex, marketEntryFilesOf } from '../market-index.js';

describe('市场索引的迁移', () => {
  it('迁移时把老产物路径里的 unit 补进元数据', () => {
    const legacy: MarketIndex = {
      format: 1,
      plugins: [
        {
          name: '@scope/module-x',
          versions: [
            {
              version: '0.1.0',
              source: { type: 'git', url: 'https://git.example.com/m.git', commit: 'a'.repeat(40), path: 'packages/x' },
            },
          ],
        },
      ],
    };
    const files = marketEntryFilesOf(legacy, 'market');
    const entry = JSON.parse(files[0]?.text ?? '{}');
    expect(entry.metadata).toEqual({ unit: 'x' });
    expect(assembleMarketIndex(files).ok).toBe(true);
  });
});
