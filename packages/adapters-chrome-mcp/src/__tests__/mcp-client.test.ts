import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMcpClient } from '../mcp-client';

const server = fileURLToPath(new URL('./fixtures/chrome-mcp-server.mjs', import.meta.url));

function client(): ReturnType<typeof createMcpClient> {
  return createMcpClient({ command: process.execPath, args: [server], timeoutMs: 5000 });
}

describe('最小 MCP 客户端（stdio + 行分隔 JSON-RPC）', () => {
  it('握手之后能列工具，工具名与说明都拿到', async () => {
    const mcp = client();
    try {
      const tools = await mcp.listTools();
      expect(tools.map((tool) => tool.name)).toEqual(['browser_navigate', 'browser_evaluate']);
      expect(tools[0]?.description).toBe('打开一个页面');
    } finally {
      await mcp.close();
    }
  });

  it('调工具把页面打开再求值，返回解开的 JSON', async () => {
    const mcp = client();
    try {
      await mcp.callTool('browser_navigate', { url: 'https://example.test/' });
      const value = (await mcp.callTool('browser_evaluate', { script: 'document.title' })) as Record<string, unknown>;
      expect(value['url']).toBe('https://example.test/');
      expect(value['script']).toBe('document.title');
      expect(value['title']).toBe('Fake Chrome');
    } finally {
      await mcp.close();
    }
  });

  it('服务端报错原样变成异常，不吞', async () => {
    const mcp = client();
    try {
      await expect(mcp.callTool('browser_missing')).rejects.toThrow(/没有这个工具/);
    } finally {
      await mcp.close();
    }
  });

  it('关掉之后再调就失败，不会吊着', async () => {
    const mcp = client();
    await mcp.listTools();
    await mcp.close();
    await expect(mcp.callTool('browser_evaluate', { script: '1' })).rejects.toThrow();
  });
});
