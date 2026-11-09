import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshRequest, DshWebRoute } from '../../api/dsh.js';
import { ACTIONS_PREFIX } from '../../config/constants.js';
import { registerActions, type PostResource, type PostWrite } from '../http.js';

function fakeCtx(): { ctx: DshHostContext; registered: DshWebRoute[] } {
  const registered: DshWebRoute[] = [];
  const ctx = {
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

async function run(
  resourceName: string,
  resources: readonly PostResource[],
  wrote: (resource: string, write: PostWrite) => void,
  body: unknown = {},
): Promise<{ statusCode: number; body: string }> {
  const { ctx, registered } = fakeCtx();
  registerActions(ctx, resources, wrote);
  const { res, state } = fakeRes();
  await (registered[0] as DshWebRoute).handler(post(`${ACTIONS_PREFIX}/${resourceName}`, body), res);
  return state;
}

describe('写通道的 redact（敏感回执值不进 facts 那条口子）', () => {
  it('★★ redact 资源：wrote 收到的第二项里连 args 这个键都没有', async () => {
    const writes: PostWrite[] = [];

    await run(
      'answer',
      [{ resource: 'answer', redact: true, handle: () => ({ ok: true }) }],
      (_resource, write) => writes.push(write),
      { host: 'db.internal', token: 'SECRET-TOKEN' },
    );

    expect(writes).toHaveLength(1);
    expect(writes[0]?.args).toBeUndefined();
    expect(Object.hasOwn(writes[0] ?? {}, 'args')).toBe(false);
    expect(writes[0]?.result).toEqual({ ok: true });
    expect(JSON.stringify(writes[0])).not.toContain('SECRET-TOKEN');
  });

  it('★★ 普通资源照旧带 args（既有写通道的行为一个字节不变）', async () => {
    const writes: PostWrite[] = [];

    await run(
      'release',
      [
        { resource: 'release', handle: () => ({ ok: true }) },
        { resource: 'read-only', redact: false, handle: () => ({ ok: true }) },
      ],
      (_resource, write) => writes.push(write),
      { env: 'prod' },
    );

    expect(writes).toHaveLength(1);
    expect(writes[0]?.args).toEqual({ env: 'prod' });
  });

  it('★ redact 只管 args：result 与「写成功」的判断照旧走', async () => {
    const seen: string[] = [];

    const state = await run(
      'answer',
      [
        { resource: 'panels', handle: () => ({ ok: true }) },
        { resource: 'answer', redact: true, handle: () => ({ ok: true, from: 'answer' }) },
      ],
      (resource) => seen.push(resource),
      { token: 't' },
    );

    expect(seen).toEqual(['answer']);
    expect(state.statusCode).toBe(200);
    expect(JSON.parse(state.body)).toEqual({ ok: true, from: 'answer' });
  });
});
