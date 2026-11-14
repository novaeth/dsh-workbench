import { aiError, type AiToolDefinition } from '@dsh-workbench/shared/host';

interface ToolRunContextLike {
  readonly signal?: AbortSignal | undefined;
}

interface ToolRegistryLike {
  register(definition: Readonly<Record<string, unknown>>): () => void;
}

export interface BridgeTool {
  readonly name: string;
  dispose(): void;
}

const OUTPUT = { type: 'object' } as const;

function descriptionOf(tools: readonly AiToolDefinition[]): string {
  const lines = tools.map((one) => `- ${one.name}：${one.description}`);
  return [
    '调一个本模块提供的子工具。参数是 { "tool": "<子工具名>", "args": <那个子工具自己的参数对象> }。',
    '可用的子工具：',
    ...lines,
  ].join('\n');
}

export function registerBridgeTool(
  registry: ToolRegistryLike,
  tools: readonly AiToolDefinition[],
  timeoutMsPerTool: number,
  signal: AbortSignal | undefined,
): BridgeTool {
  const byName = new Map(tools.map((one) => [one.name, one]));
  const name = `wb_ai_call_${String(Math.random()).slice(2, 10)}`;
  const dispose = registry.register({
    name,
    description: descriptionOf(tools),
    parameters: {
      type: 'object',
      required: ['tool'],
      properties: {
        tool: { type: 'string', enum: tools.map((one) => one.name) },
        args: { type: 'object' },
      },
    },
    output: {
      schema: OUTPUT,
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value ?? {}) }],
    },
    execute: async (raw: unknown, exec: ToolRunContextLike): Promise<unknown> => {
      const call = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      const toolName = typeof call['tool'] === 'string' ? call['tool'] : '';
      const found = byName.get(toolName);
      if (found === undefined) {
        return { ok: false, error: `没有这个子工具：${toolName === '' ? '(空)' : toolName}` };
      }
      const scoped = new AbortController();
      const timer =
        timeoutMsPerTool > 0 ? setTimeout(() => { scoped.abort(); }, timeoutMsPerTool) : undefined;
      const forward = (): void => { scoped.abort(); };
      signal?.addEventListener('abort', forward, { once: true });
      exec.signal?.addEventListener('abort', forward, { once: true });
      try {
        const value = await found.run(call['args'] ?? {}, { signal: scoped.signal });
        return { ok: true, value: value ?? null };
      } catch (error) {
        if (scoped.signal.aborted) throw aiError('timeout', `子工具 ${toolName} 超时或被中止`);
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        signal?.removeEventListener('abort', forward);
        exec.signal?.removeEventListener('abort', forward);
      }
    },
  });
  return { name, dispose };
}
