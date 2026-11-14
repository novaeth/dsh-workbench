import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { RequestPlan } from '../../contract/data.js';
import { scriptOfPlan } from '../data-plan.js';

interface PageResult {
  readonly ok: boolean;
  readonly steps?: Record<string, { readonly ok: boolean; readonly value?: unknown; readonly code?: string }>;
}

interface SandboxOptions {
  readonly fetch?: (url: string) => unknown;
  readonly domParser?: new () => { parseFromString: (text: string) => unknown };
}

async function run(plan: RequestPlan, options: SandboxOptions = {}): Promise<PageResult> {
  const sandbox = {
    location: { origin: 'https://oa.example.com' },
    URL,
    URLSearchParams,
    Response,
    AbortSignal,
    btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
    console,
    DOMParser: options.domParser,
    fetch: async (input: string | URL) => new Response(JSON.stringify(await options.fetch?.(String(input))), { status: 200 }),
  };
  return (await runInNewContext(scriptOfPlan(plan), sandbox)) as PageResult;
}

const origin = 'https://oa.example.com';

describe('plan 页面脚本执行', () => {
  it('repeat 按区间跑，结果收成数组', async () => {
    const pages: string[] = [];
    const plan: RequestPlan = {
      origin,
      steps: [
        {
          name: 'item',
          request: { method: 'GET', path: '/api/item/{{item}}' },
          repeat: { over: '1..3' },
          response: { kind: 'json', path: 'id' },
        },
      ],
    };
    const result = await run(plan, {
      fetch: (url) => {
        pages.push(url);
        return { id: Number(url.split('/').at(-1)) };
      },
    });
    expect(result.ok).toBe(true);
    expect(pages).toHaveLength(3);
    expect(result.steps?.['item']).toMatchObject({ ok: true, value: [1, 2, 3] });
  });

  it('while 用原始 JSON 的 path 判终止，并把每页收成数组', async () => {
    const plan: RequestPlan = {
      origin,
      steps: [
        {
          name: 'rows',
          request: { method: 'GET', path: '/api/rows', query: { page: '{{page}}' } },
          while: { path: 'hasNext', equals: false, max: 5 },
          response: { kind: 'json', path: 'rows' },
        },
      ],
    };
    const result = await run(plan, {
      fetch: (url) => {
        const page = Number(new URL(url).searchParams.get('page'));
        return { rows: [page], hasNext: page < 3 };
      },
    });
    expect(result.steps?.['rows']).toMatchObject({ ok: true, value: [[1], [2], [3]] });
  });

  it('while 到 max 还没终止 → 这一步失败', async () => {
    const plan: RequestPlan = {
      origin,
      steps: [
        {
          name: 'rows',
          request: { method: 'GET', path: '/api/rows', query: { page: '{{page}}' } },
          while: { path: 'hasNext', equals: false, max: 2 },
          response: { kind: 'json', path: 'rows' },
        },
      ],
    };
    const result = await run(plan, { fetch: () => ({ rows: [], hasNext: true }) });
    expect(result.steps?.['rows']).toMatchObject({ ok: false, code: 'too-many-iterations' });
  });

  it('html 按 selector 取行，fields 取列', async () => {
    const make = (title: string) => ({
      textContent: ` ${title} `,
      innerHTML: `<td>${title}</td>`,
      querySelector: () => ({ textContent: ` ${title} ` }),
    });
    const parsed = {
      querySelectorAll: (selector: string) => (selector === 'table tr' ? [make('甲'), make('乙')] : []),
    };
    const domParser = class {
      parseFromString(): unknown {
        return parsed;
      }
    };
    const plan: RequestPlan = {
      origin,
      steps: [
        {
          name: 'table',
          request: { method: 'GET', path: '/api/table' },
          response: { kind: 'html', selector: 'table tr', fields: { title: 'td' } },
        },
      ],
    };
    const result = await run(plan, { fetch: () => ({}), domParser });
    expect(result.steps?.['table']).toMatchObject({
      ok: true,
      value: [{ title: '甲' }, { title: '乙' }],
    });
  });

  it('2xx 空 body 当作成功，值为 null（写接口常见 204）', async () => {
    const plan: RequestPlan = {
      origin,
      steps: [{ name: 'write', request: { method: 'POST', path: '/api/write' } }],
    };
    const sandbox = {
      location: { origin },
      URL,
      URLSearchParams,
      Response,
      AbortSignal,
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
      console,
      fetch: async () => new Response(null, { status: 204 }),
    };
    const result = (await runInNewContext(scriptOfPlan(plan), sandbox)) as PageResult;
    expect(result.steps?.['write']).toMatchObject({ ok: true, value: null });
  });

  it('403 的 authLoss 响应体超过 200 字节也能命中', async () => {
    const plan: RequestPlan = {
      origin,
      authLoss: { path: 'code', equals: '002', messagePath: 'msg' },
      steps: [{ name: 'rows', request: { method: 'GET', path: '/api/rows' } }],
    };
    const body = { code: '002', msg: '登录已过期', pad: 'x'.repeat(400) };
    const sandbox = {
      location: { origin },
      URL,
      URLSearchParams,
      Response,
      AbortSignal,
      TextEncoder,
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
      console,
      fetch: async () => new Response(JSON.stringify(body), { status: 403 }),
    };
    const result = (await runInNewContext(scriptOfPlan(plan), sandbox)) as PageResult;
    expect(result.steps?.['rows']).toMatchObject({ ok: false, code: 'not-logged-in', message: '登录已过期' });
  });

  it('403 但计划声明了 authLoss 且响应体命中：按登录丢失收口', async () => {
    const plan: RequestPlan = {
      origin,
      authLoss: { path: 'code', equals: '002' },
      steps: [{ name: 'rows', request: { method: 'GET', path: '/api/rows' } }],
    };
    const sandbox = {
      location: { origin },
      URL,
      URLSearchParams,
      Response,
      AbortSignal,
      TextEncoder,
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
      console,
      fetch: async () => new Response(JSON.stringify({ code: '002' }), { status: 403 }),
    };
    const result = (await runInNewContext(scriptOfPlan(plan), sandbox)) as PageResult;
    expect(result.steps?.['rows']).toMatchObject({ ok: false, code: 'not-logged-in' });
  });

  it('403 归 permission-denied，不是 not-logged-in', async () => {
    const plan: RequestPlan = {
      origin,
      steps: [{ name: 'rows', request: { method: 'GET', path: '/api/rows' } }],
    };
    const sandbox = {
      location: { origin },
      URL,
      URLSearchParams,
      Response,
      AbortSignal,
      TextEncoder,
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
      console,
      fetch: async () => new Response('{}', { status: 403 }),
    };
    const result = (await runInNewContext(scriptOfPlan(plan), sandbox)) as PageResult;
    expect(result.steps?.['rows']).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('repeat.over 两端必须都是数字：1.. 与 ..3 都不认', async () => {
    const bad = { origin, steps: [{ name: 'rows', request: { method: 'GET', path: '/api/rows' }, repeat: { over: '1..' } }] };
    const sandbox = {
      location: { origin },
      URL,
      URLSearchParams,
      Response,
      AbortSignal,
      TextEncoder,
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
      console,
      fetch: async () => new Response('{}', { status: 200 }),
    };
    const result = (await runInNewContext(scriptOfPlan(bad as never), sandbox)) as PageResult;
    expect(result.steps?.['rows']).toMatchObject({ ok: false, code: 'repeat-invalid' });
  });

  it('authLoss 给了空 in 时退回 equals', async () => {
    const plan: RequestPlan = {
      origin,
      authLoss: { path: 'code', equals: '002', in: [] },
      steps: [{ name: 'rows', request: { method: 'GET', path: '/api/rows' } }],
    };
    const sandbox = {
      location: { origin },
      URL,
      URLSearchParams,
      Response,
      AbortSignal,
      TextEncoder,
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
      console,
      fetch: async () => new Response(JSON.stringify({ code: '002' }), { status: 200 }),
    };
    const result = (await runInNewContext(scriptOfPlan(plan), sandbox)) as PageResult;
    expect(result.steps?.['rows']).toMatchObject({ ok: false, code: 'not-logged-in' });
  });

  it('authLoss 命中：这一步按需要登录收口，带计划给的那句', async () => {
    const plan: RequestPlan = {
      origin,
      authLoss: { path: 'code', equals: '002', messagePath: 'msg' },
      steps: [{ name: 'rows', request: { method: 'GET', path: '/api/rows' } }],
    };
    const sandbox = {
      location: { origin },
      URL,
      URLSearchParams,
      Response,
      AbortSignal,
      TextEncoder,
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
      console,
      fetch: async () => new Response(JSON.stringify({ code: '002', msg: '登录已过期' }), { status: 200 }),
    };
    const result = (await runInNewContext(scriptOfPlan(plan), sandbox)) as PageResult;
    expect(result.steps?.['rows']).toMatchObject({ ok: false, code: 'not-logged-in', message: '登录已过期' });
  });

  it('非 2xx 的空 body 不算成功', async () => {
    const plan: RequestPlan = {
      origin,
      steps: [{ name: 'write', request: { method: 'POST', path: '/api/write' } }],
    };
    const sandbox = {
      location: { origin },
      URL,
      URLSearchParams,
      Response,
      AbortSignal,
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
      console,
      fetch: async () => new Response(null, { status: 500 }),
    };
    const result = (await runInNewContext(scriptOfPlan(plan), sandbox)) as PageResult;
    expect(result.steps?.['write']).toMatchObject({ ok: false, code: 'http' });
  });

  it('超过 maxBytes 的文本响应这一步失败', async () => {
    const plan: RequestPlan = {
      origin,
      steps: [{ name: 'big', request: { method: 'GET', path: '/big' }, response: { kind: 'text', maxBytes: 3 } }],
    };
    const sandbox = {
      location: { origin },
      URL,
      URLSearchParams,
      Response,
      AbortSignal,
      btoa: (value: string) => Buffer.from(value, 'binary').toString('base64'),
      console,
      fetch: async () => new Response('too long', { status: 200 }),
    };
    const result = (await runInNewContext(scriptOfPlan(plan), sandbox)) as PageResult;
    expect(result.steps?.['big']).toMatchObject({ ok: false, code: 'too-large' });
  });
});
