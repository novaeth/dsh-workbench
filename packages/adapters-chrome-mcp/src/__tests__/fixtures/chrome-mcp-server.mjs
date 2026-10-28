import { createInterface } from 'node:readline';

const TOOLS = [
  {
    name: 'browser_navigate',
    description: '打开一个页面',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
  {
    name: 'browser_evaluate',
    description: '在当前页面里求值',
    inputSchema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] },
  },
];

const state = { url: 'about:blank', script: '', calls: 0 };

const answer = (id, result) => ({ jsonrpc: '2.0', id, result });

const handle = (message) => {
  const { id, method, params } = message;
  if (id === undefined) return undefined;
  if (method === 'initialize') {
    return answer(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'fake-chrome-mcp', version: '0.0.0' },
    });
  }
  if (method === 'tools/list') return answer(id, { tools: TOOLS });
  if (method === 'tools/call') {
    const { name, arguments: args } = params ?? {};
    state.calls += 1;
    if (name === 'browser_navigate') {
      state.url = String(args?.url ?? '');
      return answer(id, { content: [{ type: 'text', text: JSON.stringify({ ok: true, url: state.url }) }] });
    }
    if (name === 'browser_evaluate') {
      state.script = String(args?.script ?? '');
      return answer(id, {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ url: state.url, script: state.script, title: 'Fake Chrome', calls: state.calls }),
          },
        ],
      });
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `没有这个工具：${name}` } };
  }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `没有这个方法：${method}` } };
};

const lines = createInterface({ input: process.stdin });

lines.on('line', (line) => {
  if (line.trim() === '') return;
  const message = JSON.parse(line);
  const reply = handle(message);
  if (reply !== undefined) process.stdout.write(`${JSON.stringify(reply)}\n`);
});
