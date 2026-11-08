import { describe, expect, it } from 'vitest';
import type { DiscoverPayload } from '@dsh-workbench/shared/contract/protocol/market-index';
import { marketCategoriesTool } from '../market-categories-tool';

function payloadOf(categories: readonly (string | undefined)[]): DiscoverPayload {
  return {
    state: 'ready',
    sources: [],
    selected: null,
    entries: categories.map((category, index) => ({
      name: `@t/module-${String(index)}`,
      labels: [],
      ...(category === undefined ? {} : { category }),
      versions: [],
    })),
  };
}

async function run(read: (() => Promise<DiscoverPayload>) | undefined): Promise<Record<string, unknown>> {
  const tool = marketCategoriesTool(read);
  const execute = tool.execute as (args: unknown) => Promise<unknown>;
  return (await execute({})) as Record<string, unknown>;
}

describe('workbench_market_categories：已经用过的分类', () => {
  it('按分类汇总条目数，并给出给人看的话', async () => {
    const payload = await run(async () => payloadOf(['任务与协作', '任务与协作', '用量与计费']));

    expect(payload['categories']).toEqual([
      { id: '任务与协作', count: 2 },
      { id: '用量与计费', count: 1 },
    ]);
    expect(payload['entries']).toBe(3);
    expect(String(payload['text'])).toContain('任务与协作（2 个模块）');
  });

  it('还没有分类时告诉模型怎么定第一个', async () => {
    const payload = await run(async () => payloadOf([undefined]));

    expect(payload['categories']).toEqual([]);
    expect(String(payload['text'])).toContain('还没有分类');
  });
});
