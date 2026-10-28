import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRuntimePort } from '../runtime-port.js';

const STUB = fileURLToPath(new URL('./fixtures/chrome-mcp-server.mjs', import.meta.url));
const ctx = { get: () => undefined } as never;

describe('运行时自检：MCP server 起不起得来', () => {
  it('起得来 → 报工具数（这一步是「预检」里属于适配器自己的那条）', async () => {
    const port = createRuntimePort({
      server: { command: process.execPath, args: [STUB], timeoutMs: 10_000 },
    });
    const verdict = await port.check?.(ctx);
    expect(verdict?.ok).toBe(true);
    expect(verdict?.detail).toContain('个工具');
  });

  it('起不来 → 说清楚装什么', async () => {
    const port = createRuntimePort({
      server: { command: '/nonexistent/chrome-devtools-mcp', args: [], timeoutMs: 2_000 },
    });
    const verdict = await port.check?.(ctx);
    expect(verdict?.ok).toBe(false);
    expect(verdict?.detail).toContain('npx -y chrome-devtools-mcp@latest');
  });
});
