import { describe, expect, it } from 'vitest';
import { createSeam, type DshShell } from '@dsh-workbench/shared/host';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createDataReader } from '../index.js';
import type { RequestPlan } from '@dsh-workbench/shared/host';

function seamFor(shell: DshShell) {
  return createSeam({ shell, runtimeRoot: '/tmp/wb-seam-test' });
}

const plan: RequestPlan = {
  origin: 'https://oa.example.com',
  loginUrl: 'https://oa.example.com/',
  steps: [
    { name: 'key', request: { method: 'POST', path: '/api/split' } },
    { name: 'rows', request: { method: 'POST', path: '/api/rows', body: { key: '{{key}}' } } },
  ],
};

function readerOf(replies: Parameters<typeof createFakeShell>[0]) {
  const fake = createFakeShell(replies);
  return { reader: createDataReader({ seam: seamFor(fake.shell), channel: false }), fake };
}

describe('DataReader.plan', () => {
  it('页面结果摊平，耗时透传，auth 带 loginUrl', async () => {
    const { reader } = readerOf([
      {
        stdout: JSON.stringify({
          ok: true,
          steps: {
            key: { ok: true, value: 'abc', elapsedMs: 4 },
            rows: { ok: false, code: 'not-logged-in', message: '登录信息超时', elapsedMs: 9 },
          },
        }),
      },
    ]);
    const out = await reader.plan(plan);
    expect(out['key']).toMatchObject({ ok: true, data: 'abc', elapsedMs: 4 });
    expect(out['rows']).toMatchObject({
      ok: false,
      elapsedMs: 9,
      error: { code: 'auth', helpUrl: 'https://oa.example.com/' },
    });
  });

  it('执行缝回 aborted：每一步都是 aborted，不再重试', async () => {
    const { reader, fake } = readerOf([{ aborted: true }]);
    const controller = new AbortController();
    const out = await reader.plan(plan, { signal: controller.signal });
    expect(out['key']).toMatchObject({ ok: false, error: { code: 'aborted' } });
    expect(out['rows']).toMatchObject({ ok: false, error: { code: 'aborted' } });
    expect(fake.commands()).toHaveLength(1);
  });

  it('bytes.saveAs attachment 把 base64 交给附件服务并回引用', async () => {
    const fake = createFakeShell([
      {
        stdout: JSON.stringify({
          ok: true,
          steps: {
            key: { ok: true, value: { base64: 'aGk=', size: 2, contentType: 'text/plain' }, elapsedMs: 1 },
          },
        }),
      },
    ]);
    const saved: Array<{ data: Uint8Array; contentType: string; name: string }> = [];
    const reader = createDataReader({
      seam: seamFor(fake.shell),
      channel: false,
      saveBytes: async (input) => {
        saved.push(input);
        return { attachmentId: 'a-1' };
      },
    });
    const out = await reader.plan({
      ...plan,
      steps: [{ ...plan.steps[0]!, response: { kind: 'bytes', saveAs: 'attachment' } }],
    });
    expect(saved).toHaveLength(1);
    expect(Buffer.from(saved[0]!.data).toString('utf8')).toBe('hi');
    expect(saved[0]).toMatchObject({ contentType: 'text/plain', name: 'key' });
    expect(out['key']).toMatchObject({ ok: true, data: { attachmentId: 'a-1' } });
  });

  it('没有附件服务时这一步失败，不是静默回 base64', async () => {
    const { reader } = readerOf([
      {
        stdout: JSON.stringify({
          ok: true,
          steps: { key: { ok: true, value: { base64: 'aGk=', size: 2, contentType: 'text/plain' } } },
        }),
      },
    ]);
    const out = await reader.plan({
      ...plan,
      steps: [{ ...plan.steps[0]!, response: { kind: 'bytes', saveAs: 'attachment' } }],
    });
    expect(out['key']).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
  });

  it('附件内容坏掉（base64 不完整）：这一步 parse，不落盘', async () => {
    const fake = createFakeShell([
      { stdout: JSON.stringify({ ok: true, steps: { key: { ok: true, value: { base64: 'aGk', size: 2 } } } }) },
    ]);
    const saved: unknown[] = [];
    const reader = createDataReader({
      seam: seamFor(fake.shell),
      channel: false,
      saveBytes: async (input) => {
        saved.push(input);
        return { attachmentId: 'a-1' };
      },
    });
    const out = await reader.plan({
      ...plan,
      steps: [{ ...plan.steps[0]!, response: { kind: 'bytes', saveAs: 'attachment' } }],
    });
    expect(out['key']).toMatchObject({ ok: false, error: { code: 'parse', pageCode: 'attachment-broken' } });
    expect(saved).toEqual([]);
  });

  it('计划构建期错误：每一步 invalid-request，一条命令都不发', async () => {
    const { reader, fake } = readerOf([{ stdout: '{}' }]);
    const out = await reader.plan({ ...plan, steps: [] });
    expect(out).toEqual({});
    expect(fake.commands()).toEqual([]);
  });
});
