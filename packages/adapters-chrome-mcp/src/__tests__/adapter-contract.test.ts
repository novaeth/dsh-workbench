import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { adapterContractGaps } from '@dsh-workbench/shared/host';
import { createAdapterSet } from '../index.js';

const server = fileURLToPath(new URL('./fixtures/chrome-mcp-server.mjs', import.meta.url));
const ctx = { get: () => undefined } as never;

function set(): ReturnType<typeof createAdapterSet> {
  return createAdapterSet(ctx, { server: process.execPath, args: [server] });
}

describe('适配器契约（Chrome MCP 集合）', () => {
  it('过同一份契约：成员、能力、health/commands、data、布局', () => {
    expect(adapterContractGaps(set(), ctx)).toEqual([]);
  });

  it('能力表说清它没有哪几样：没有命令行、没有插件市场、没有 CLI 浏览器桥、没有平台读、没有 libs', () => {
    expect(set().runtime.capabilities(ctx)).toEqual({
      console: false,
      pluginMarket: false,
      browserBridge: false,
    });
  });

  it('health 只有自己这一个运行时，没有命令行就别报命令', () => {
    const runtime = set().runtime;
    expect(Object.keys(runtime.commands(ctx))).toEqual([]);
    expect(Object.keys(runtime.health(ctx))).toEqual(['chrome-mcp']);
  });

  it('浏览器读走 MCP 的 tools/call：navigate + evaluate', async () => {
    const data = set().data;
    const result = await data.read<{ url: string; title: string }>({
      kind: 'browser',
      url: 'https://example.test/',
      script: 'document.title',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.url).toBe('https://example.test/');
      expect(result.data.title).toBe('Fake Chrome');
    }
  });

  it('没有 http / command 通道时给明确的失败，不是空结果', async () => {
    const data = set().data;
    const http = await data.read({ kind: 'http', url: 'https://example.test/' });
    expect(http.ok).toBe(false);
    const command = await data.read({ kind: 'command', adapter: 'opencli', argv: ['--version'] });
    expect(command.ok).toBe(false);
  });

  it('★ 没有命令面：DIY 的 recon 会明说「这个运行时没有可探测的命令面」，不编命令', () => {
    expect(set().runtime.commandSurface).toBeUndefined();
  });
});
