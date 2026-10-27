import { describe, expect, it } from 'vitest';
import type { DshHostContext, DshRequest, DshWebRoute } from '@dsh-workbench/shared';
import { ACTIONS_PREFIX, PREFS_PREFIX } from '@dsh-workbench/shared';
import { registerActions, registerPrefs, type PostResource } from '@dsh-workbench/shared/host';

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

function post(url: string): DshRequest {
  const chunks = [Buffer.from('{}')];
  return {
    method: 'POST',
    url,
    [Symbol.asyncIterator]: () => {
      let index = 0;
      return {
        next: async () =>
          index < chunks.length
            ? { value: chunks[index++], done: false }
            : { value: undefined, done: true },
      };
    },
  } as unknown as DshRequest;
}

describe('写通道 → 事实账本', () => {
  it('★ 偏好写（面板配置）写成功之后记一笔，点名那个资源', async () => {
    const { ctx, registered } = fakeCtx();
    const bumped: string[] = [];
    const table: readonly PostResource[] = [{ resource: 'panels', handle: () => ({ ok: true }) }];
    registerPrefs(ctx, table, (resource: string) => bumped.push(resource));

    const { res } = fakeRes();
    await (registered[0] as DshWebRoute).handler(post(`${PREFS_PREFIX}/panels`), res);

    expect(bumped).toEqual(['panels']);
  });

  it('★ 动作（"发到 XX 环境"跑完）也记一笔 —— 卡片据此自己重画', async () => {
    const { ctx, registered } = fakeCtx();
    const bumped: string[] = [];
    registerActions(ctx, [{ resource: 'inventory/release', handle: () => ({ ok: true }) }], (resource: string) =>
      bumped.push(resource),
    );

    const { res } = fakeRes();
    await (registered[0] as DshWebRoute).handler(post(`${ACTIONS_PREFIX}/inventory/release`), res);

    expect(bumped).toEqual(['inventory/release']);
  });

  it('**失败的写不记**（没落盘就没有"变了"这回事）—— 与供给路由的口径刻意不同', async () => {
    const { ctx, registered } = fakeCtx();
    const bumped: string[] = [];
    registerPrefs(
      ctx,
      [
        {
          resource: 'panels',
          handle: () => {
            throw new Error('写失败了');
          },
        },
      ],
      (resource: string) => bumped.push(resource),
    );

    const { res, state } = fakeRes();
    await (registered[0] as DshWebRoute).handler(post(`${PREFS_PREFIX}/panels`), res);

    expect(JSON.parse(state.body)).toMatchObject({ ok: false });
    expect(bumped).toEqual([]);
  });
});
