import type { DshToolDefinition } from '@dsh-workbench/shared';
import type { DiscoverPayload } from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_CATEGORIES_TOOL } from '../unit';
import { textOutput } from './tool-output';

const OUTPUT = textOutput({
  categories: { type: 'array', items: { type: 'object', additionalProperties: true } },
  entries: { type: 'number' },
});

export function marketCategoriesTool(
  read: (() => Promise<DiscoverPayload>) | undefined,
): DshToolDefinition {
  return {
    name: MARKET_CATEGORIES_TOOL,
    description: '看当前索引里已经有哪些分类：发布模块时挑一个沿用，别每发一次造一个新词。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: OUTPUT,
    async execute() {
      if (read === undefined) throw new Error('这台机器上没有索引服务，看不了分类');
      const payload = await read();
      const counts = new Map<string, number>();
      for (const entry of payload.entries) {
        const category = entry.category ?? '';
        if (category === '') continue;
        counts.set(category, (counts.get(category) ?? 0) + 1);
      }
      const categories = [...counts].map(([id, count]) => ({ id, count }));
      const text =
        categories.length === 0
          ? '当前索引里还没有分类 —— 发布时用 category 定一个（一个短词，比如「任务与协作」），之后这里就会出现。'
          : [
              '当前索引里的分类：',
              ...categories.map((one) => `- ${one.id}（${String(one.count)} 个模块）`),
            ].join('\n');
      return { categories, entries: payload.entries.length, text };
    },
  };
}
