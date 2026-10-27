import type { DshToolDefinition } from '@dsh-workbench/shared';
import type { MarketSourcesPayload } from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_SOURCES_TOOL } from '../unit';

const OUTPUT = {
  schema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      sources: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
    additionalProperties: true,
  },
  render: (_args: unknown, value: unknown) => {
    const payload = value as { text?: unknown } | null;
    return [{ type: 'text', text: typeof payload?.text === 'string' ? payload.text : JSON.stringify(value) }];
  },
};

export function marketSourcesTool(
  read: (() => MarketSourcesPayload) | undefined,
): DshToolDefinition {
  return {
    name: MARKET_SOURCES_TOOL,
    description: '看本机的索引源：id、地址、是否可发布、当前用的是哪个。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: OUTPUT,
    async execute() {
      if (read === undefined) throw new Error('这台机器上没有索引源服务，看不了');
      const payload = read();
      const rows = payload.sources.map((source) => ({
        id: source.id,
        label: source.label,
        kind: source.kind,
        url: source.url,
        policy: source.policy ?? 'catalog-only',
        ref: source.ref ?? null,
        path: source.path ?? null,
        selected: source.id === payload.selected,
      }));
      if (rows.length === 0) {
        return {
          sources: rows,
          selected: payload.selected,
          text: '这台机器还没有索引源 —— 在「模块市场 → 发现 → 索引源」里加一个。',
        };
      }
      const current = rows.find((one) => one.selected);
      const head =
        current === undefined ? '当前没有选中索引源' : `当前：${current.label}（${current.url}）`;
      const lines = rows.map((one) => {
        const state = one.policy === 'artifacts-in-repo' ? '可发布' : '仅读取模块列表';
        return `${one.selected ? '●' : '○'} ${one.id} · ${one.label} · ${one.kind} · ${state} · ${one.url}`;
      });
      return {
        sources: rows,
        selected: payload.selected,
        text: [head, ...lines].join('\n'),
      };
    },
  };
}
