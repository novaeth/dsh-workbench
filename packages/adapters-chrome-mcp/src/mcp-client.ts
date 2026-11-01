import type { ChannelHandle, Seam } from '@dsh-workbench/shared/host';

export interface McpToolInfo {
  readonly name: string;
  readonly description?: string | undefined;
}

export interface McpServerOptions {
  readonly command: string;
  readonly args?: readonly string[] | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly timeoutMs?: number | undefined;
}

export interface McpClientOptions extends McpServerOptions {
  readonly seam: Seam;
}

export interface McpClient {
  listTools(): Promise<readonly McpToolInfo[]>;
  callTool(name: string, args?: Readonly<Record<string, unknown>>): Promise<unknown>;
  close(): Promise<void>;
}

interface Pending {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

const PROTOCOL_VERSION = '2025-06-18';
const DEFAULT_TIMEOUT_MS = 20_000;

function payloadOf(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const record = value as Record<string, unknown>;
  const content = Array.isArray(record['content']) ? (record['content'] as unknown[]) : undefined;
  if (content === undefined || content.length === 0) return record;
  const first = content[0];
  if (typeof first !== 'object' || first === null) return record;
  const text = (first as Record<string, unknown>)['text'];
  if (typeof text !== 'string') return record;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function envOf(env: NodeJS.ProcessEnv | undefined): Record<string, string> | undefined {
  if (env === undefined) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function exitReasonOf(event: { readonly code: number | null; readonly signal: string | null }): string {
  return event.code === null && event.signal === null ? 'MCP server 起不来' : 'MCP server 退出了';
}

export function createMcpClient(options: McpClientOptions): McpClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const env = envOf(options.env);
  const pending = new Map<number, Pending>();
  let channel: ChannelHandle | undefined;
  let buffered = '';
  let nextId = 1;
  let ready: Promise<void> | undefined;
  let closed = false;

  function send(message: Record<string, unknown>): void {
    if (channel === undefined) throw new Error('MCP server 没起来');
    channel.write(`${JSON.stringify(message)}\n`);
  }

  function request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP ${method} 超时（${timeoutMs}ms）`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      send({ jsonrpc: '2.0', id, method, params });
    });
  }

  function onLine(line: string): void {
    const text = line.trim();
    const start = text.indexOf('{');
    if (start < 0) return;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(text.slice(start)) as Record<string, unknown>;
    } catch {
      return;
    }
    const id = typeof message['id'] === 'number' ? message['id'] : undefined;
    if (id === undefined) return;
    const waiting = pending.get(id);
    if (waiting === undefined) return;
    pending.delete(id);
    clearTimeout(waiting.timer);
    const error = message['error'];
    if (error !== undefined) {
      const detail =
        typeof error === 'object' && error !== null
          ? String((error as Record<string, unknown>)['message'] ?? JSON.stringify(error))
          : String(error);
      waiting.reject(new Error(detail));
      return;
    }
    waiting.resolve(message['result']);
  }

  function fail(reason: string): void {
    for (const [id, waiting] of pending) {
      pending.delete(id);
      clearTimeout(waiting.timer);
      waiting.reject(new Error(reason));
    }
  }

  function start(): Promise<void> {
    const running = options.seam.open({
      target: { argv: [options.command, ...(options.args ?? [])] },
      intent: { kind: 'host' },
      ...(env === undefined ? {} : { env }),
      label: 'mcp',
    });
    channel = running;
    running.onData((chunk) => {
      buffered += chunk;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) onLine(line);
    });
    running.onError((error) => {
      if (!closed) fail(`MCP server 起不来：${error.message}`);
    });
    running.onExit((event) => {
      if (!closed) fail(exitReasonOf(event));
    });
    return request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'dsh-workbench', version: '0' },
    }).then(() => {
      send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    });
  }

  function ensure(): Promise<void> {
    if (closed) return Promise.reject(new Error('MCP 客户端已关闭'));
    if (ready === undefined) ready = start();
    return ready;
  }

  return {
    async listTools() {
      await ensure();
      const result = await request('tools/list', {});
      const tools = (result as Record<string, unknown> | undefined)?.['tools'];
      if (!Array.isArray(tools)) return [];
      return tools.flatMap((tool) => {
        if (typeof tool !== 'object' || tool === null) return [];
        const record = tool as Record<string, unknown>;
        const name = typeof record['name'] === 'string' ? record['name'] : '';
        if (name === '') return [];
        const description = typeof record['description'] === 'string' ? record['description'] : undefined;
        return [description === undefined ? { name } : { name, description }];
      });
    },

    async callTool(name, args = {}) {
      await ensure();
      const result = await request('tools/call', { name, arguments: { ...args } });
      return payloadOf(result);
    },

    async close() {
      closed = true;
      const running = channel;
      channel = undefined;
      ready = undefined;
      if (running === undefined) return;
      fail('MCP 客户端关了');
      const exited = new Promise<void>((resolve) => {
        running.onExit(() => resolve());
      });
      running.kill('SIGTERM');
      await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 1000).unref())]);
      running.kill('SIGKILL');
    },
  };
}
