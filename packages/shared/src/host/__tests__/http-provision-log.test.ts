import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshRequest, DshWebRoute } from '../../api/dsh.js';
import { PROVISION_PREFIX } from '../../config/constants.js';
import { WorkbenchDataError } from '../data-error.js';
import { registerProvision } from '../http.js';

function fakeCtx(warnings: string[]): { ctx: DshHostContext; registered: DshWebRoute[] } {
  const registered: DshWebRoute[] = [];
  const ctx = {
    logger: { warn: (message: string) => warnings.push(message) },
    webServer: {
      register: (route: DshWebRoute) => {
        registered.push(route);
        return () => {};
      },
    },
  } as unknown as DshHostContext;
  return { ctx, registered };
}

function fakeRes(): { res: never; state: { statusCode: number; body: string } } {
  const state = { statusCode: 0, body: '' };
  const res = {
    set statusCode(value: number) {
      state.statusCode = value;
    },
    get statusCode() {
      return state.statusCode;
    },
    setHeader: () => {},
    end: (chunk?: string) => {
      state.body = chunk ?? '';
    },
  };
  return { res: res as never, state };
}

function post(url: string, body: unknown = {}): DshRequest {
  const chunks = [Buffer.from(JSON.stringify(body))];
  return {
    method: 'POST',
    url,
    [Symbol.asyncIterator]: () => {
      let index = 0;
      return {
        next: async () =>
          index < chunks.length ? { value: chunks[index++], done: false } : { value: undefined, done: true },
      };
    },
  } as unknown as DshRequest;
}

describe('供给通道：handler 抛了要在日志里留痕', () => {
  it('★ 抛异常：响应照旧 ok:false，日志记下是哪个动作、哪个目标、什么原因', async () => {
    const warnings: string[] = [];
    const { ctx, registered } = fakeCtx(warnings);
    registerProvision(
      ctx,
      {
        handle: () => {
          throw new WorkbenchDataError('install-failed', '命令失败（退出码 1）：ERR_PNPM_FETCH_401');
        },
      },
      { bump: () => {} },
    );

    const { res, state } = fakeRes();
    await (registered[0] as DshWebRoute).handler(
      post(PROVISION_PREFIX, { action: 'install-bundle', spec: 'opencli-plugin-grafana' }),
      res,
    );

    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toMatchObject({ ok: false });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('provision install-bundle opencli-plugin-grafana');
    expect(warnings[0]).toContain('ERR_PNPM_FETCH_401');
  });

  it('成了就不该有这条日志（否则日志里全是噪音）', async () => {
    const warnings: string[] = [];
    const { ctx, registered } = fakeCtx(warnings);
    registerProvision(ctx, { handle: () => ({ ok: true }) }, { bump: () => {} });

    const { res } = fakeRes();
    await (registered[0] as DshWebRoute).handler(post(PROVISION_PREFIX, { action: 'install', unit: 'hello' }), res);

    expect(warnings).toEqual([]);
  });
});
