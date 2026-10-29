import { describe, expect, it, vi } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createDataReader } from '../index.js';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

describe('DataReader', () => {
  it('http 读成功并解析 JSON', async () => {
    const fetch = vi.fn(async () => jsonResponse({ rows: [1, 2] }));
    const reader = createDataReader({ fetch });
    const result = await reader.read({ kind: 'http', url: 'https://example.test/data' });
    expect(result).toEqual({ ok: true, data: { rows: [1, 2] } });
  });

  it('http 401 归一成 auth，不把响应体当数据', async () => {
    const fetch = vi.fn(async () => new Response('no', { status: 401 }));
    const reader = createDataReader({ fetch });
    const result = await reader.read({ kind: 'http', url: 'https://example.test/data' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'auth', status: 401 });
  });

  it('http 超时归一成 timeout', async () => {
    const fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const reader = createDataReader({ fetch: fetch as typeof globalThis.fetch });
    const result = await reader.read({ kind: 'http', url: 'https://example.test/slow', timeoutMs: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('timeout');
  });

  it('command 读成功；没有 shell 时明确拒绝', async () => {
    const fake = createFakeShell(() => ({ stdout: '{"ok":true}' }));
    const reader = createDataReader({ shell: fake.shell });
    const result = await reader.read({ kind: 'command', adapter: 'opencli', argv: ['demo', 'read'] });
    expect(result).toEqual({ ok: true, data: { ok: true } });

    const noShell = createDataReader();
    const missing = await noShell.read({ kind: 'command', adapter: 'opencli', argv: ['demo', 'read'] });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('invalid-request');
  });
});
