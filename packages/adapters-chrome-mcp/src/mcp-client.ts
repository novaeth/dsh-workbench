import { execa, type ResultPromise } from 'execa';

export interface McpToolInfo {
  readonly name: string;
  readonly description?: string | undefined;
}

export interface McpClientOptions {
  readonly command: string;
  readonly args?: readonly string[] | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly timeoutMs?: number | undefined;
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

export function createMcpClient(options: McpClientOptions): McpClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pending = new Map<number, Pending>();
  let child: ResultPromise | undefined;
  let buffered = '';
  let nextId = 1;
  let ready: Promise<void> | undefined;
  let closed = false;

  function send(message: Record<string, unknown>): void {
    if (child?.stdin === null || child?.stdin === undefined) throw new Error('MCP server 没起来');
    child.stdin.write(`${JSON.stringify(message)}\n`);
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
    if (line.trim() === '') return;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
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
    const running = execa(options.command, [...(options.args ?? [])], {
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      reject: false,
      env: { ...process.env, ...options.env },
    });
    child = running;
    running.stdout?.setEncoding('utf8');
    running.stdout?.setEncoding('utf8');
    running.stdout?.on('data', (chunk: string) => {
      buffered += String(chunk);
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) onLine(line);
    });
    running.then(
      () => {
        if (!closed) fail('MCP server 退出了');
      },
      (error: unknown) => {
        if (!closed) fail(`MCP server 起不来：${error instanceof Error ? error.message : String(error)}`);
      },
    );
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
      const running = child;
      child = undefined;
      ready = undefined;
      if (running === undefined) return;
      fail('MCP 客户端关了');
      running.kill('SIGTERM');
      await Promise.race([
        running.then(
          () => undefined,
          () => undefined,
        ),
        new Promise<void>((resolve) => setTimeout(resolve, 1000).unref()),
      ]);
      running.kill('SIGKILL');
    },
  };
}
