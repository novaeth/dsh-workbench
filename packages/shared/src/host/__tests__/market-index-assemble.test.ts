import { describe, expect, it } from 'vitest';
import type { MarketIndex } from '../../contract/protocol/market-index.js';
import { assembleMarketIndex, marketEntryFilesOf } from '../market-index.js';

describe('市场索引的条目与元数据', () => {
  it('版本文件不带元数据时，不遮住老文件里的元数据；meta 又比版本文件优先', () => {
    const version = (v: string, at: number) => ({
      name: '@scope/module-x',
      version: v,
      source: { type: 'npm' as const },
      publishTimestamp: at,
    });
    const legacyMeta = { ...version('0.1.0', 1_760_000_000), title: { zh: '旧标题' }, author: '甲' };
    const lean = version('0.2.0', 1_760_000_100);
    const assembled = assembleMarketIndex([
      { path: 'market/@scope/module-x/0.1.0.json', text: JSON.stringify(legacyMeta) },
      { path: 'market/@scope/module-x/0.2.0.json', text: JSON.stringify(lean) },
    ]);
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    expect(assembled.index.plugins[0]?.title).toEqual({ zh: '旧标题' });
    expect(assembled.index.plugins[0]?.author).toBe('甲');

    const withMeta = assembleMarketIndex([
      { path: 'market/@scope/module-x/0.1.0.json', text: JSON.stringify(legacyMeta) },
      { path: 'market/@scope/module-x/0.2.0.json', text: JSON.stringify(lean) },
      {
        path: 'market/@scope/module-x/meta-1-abcd.json',
        text: JSON.stringify({ name: '@scope/module-x', epoch: 1, publishTimestamp: 1_760_000_000, title: { zh: '新标题' } }),
      },
    ]);
    expect(withMeta.ok).toBe(true);
    if (!withMeta.ok) return;
    expect(withMeta.index.plugins[0]?.title).toEqual({ zh: '新标题' });
  });

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
    const meta = files.find((one) => one.path.endsWith('meta-1-migr.json'));
    expect(meta).toBeDefined();
    expect(JSON.parse(meta?.text ?? '{}').metadata).toEqual({ unit: 'x' });
  });
});
