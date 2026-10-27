import { describe, expect, it } from 'vitest';
import type { MarketSourcesPayload } from '@dsh-workbench/shared/contract/protocol/market-index';
import { marketSourcesTool } from './market-sources-tool';

const ssh = {
  id: 'ssh',
  label: '团队',
  kind: 'git' as const,
  url: 'git@git.example:team/market.git',
  policy: 'artifacts-in-repo' as const,
  ref: 'main',
};
const web = { id: 'web', label: '公开', kind: 'http' as const, url: 'https://r.example/market.json' };

async function run(read: (() => MarketSourcesPayload) | undefined): Promise<Record<string, unknown>> {
  const tool = marketSourcesTool(read);
  const execute = tool.execute as (args: unknown) => Promise<unknown>;
  return (await execute({})) as Record<string, unknown>;
}

describe('workbench_market_sources：只读的索引源清单', () => {
  it('列出全部源：当前是哪个、哪些可发布、哪些只读', async () => {
    const payload = await run(() => ({ sources: [ssh, web], selected: 'ssh' }));
    const rows = payload['sources'] as Array<Record<string, unknown>>;

    expect(rows.map((row) => row['id'])).toEqual(['ssh', 'web']);
    expect(rows[0]?.['selected']).toBe(true);
    expect(rows[0]?.['policy']).toBe('artifacts-in-repo');
    expect(rows[1]?.['policy']).toBe('catalog-only');
    const text = String(payload['text']);
    expect(text).toContain('当前：团队');
    expect(text).toContain('● ssh');
    expect(text).toContain('○ web');
    expect(text).toContain('可发布');
    expect(text).toContain('仅读取模块列表');
  });

  it('一个源都没有：告诉模型去哪儿加', async () => {
    const payload = await run(() => ({ sources: [], selected: null }));

    expect(payload['sources']).toEqual([]);
    expect(String(payload['text'])).toContain('还没有索引源');
  });

  it('没有索引源服务：直说看不了', async () => {
    await expect(run(undefined)).rejects.toThrow(/没有索引源服务/);
  });
});
