import { describe, expect, it } from 'vitest';
import { registerProvision } from '@dsh-workbench/shared/host';

function harness(handle: (request: unknown) => unknown) {
  const registered: Array<{ path: string; handler: (req: unknown, res: unknown) => Promise<void> }> = [];
  const ctx = {
    webServer: {
      register: (options: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
        registered.push(options);
        return () => {};
      },
    },
  } as never;
  registerProvision(ctx, { handle } as never);
  return registered[0];
}

function exchange(body: unknown) {
  const chunks = [Buffer.from(JSON.stringify(body))];
  const req = {
    method: 'POST',
    on: () => {},
    [Symbol.asyncIterator]: () => {
      let index = 0;
      return {
        next: async () =>
          index < chunks.length
            ? { value: chunks[index++], done: false }
            : { value: undefined, done: true },
      };
    },
  };
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    end(chunk: string) {
      this.body = chunk;
    },
  };
  return { req, res };
}

describe('registerProvision：依赖动作的目标字段', () => {
  it('★ 依赖动作没有 id → 400（模块要 unit、依赖要 id，不许静默换字段）', async () => {
    const route = harness(() => ({ ok: true }));

    const { req, res } = exchange({ action: 'update-dependency' });
    await route?.handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('workbench/no-id');
  });

  it('★ 共用依赖没有安装动作：`install-dependency` 按"不认识"打回（用户口径 2026-09-30）', async () => {
    const route = harness(() => ({ ok: true }));

    const { req, res } = exchange({ action: 'install-dependency', id: 'plugin:demo' });
    await route?.handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('workbench/bad-action');
  });

  it('★ 依赖动作带 id → 处理器收到 `{ action, id }`（不带 unit）', async () => {
    const calls: unknown[] = [];
    const route = harness((request) => {
      calls.push(request);
      return { ok: true, shared: [] };
    });

    const { req, res } = exchange({ action: 'update-dependency', id: 'lib:opencli-workflow' });
    await route?.handler(req, res);

    expect(calls).toEqual([{ action: 'update-dependency', id: 'lib:opencli-workflow' }]);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true });
  });

  it('模块动作仍然只认 `unit`（依赖的 id 不算数）', async () => {
    const route = harness(() => ({ ok: true }));

    const { req, res } = exchange({ action: 'install', id: 'plugin:demo' });
    await route?.handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('workbench/no-unit');
  });
});

describe('registerProvision：装 / 升 / 卸之后，用它的模块一起重读', () => {
  function ledger(provision: unknown): { route: ReturnType<typeof harness>; bumped: string[][] } {
    const registered: Array<{ path: string; handler: (req: unknown, res: unknown) => Promise<void> }> = [];
    const ctx = {
      webServer: {
        register: (options: { path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
          registered.push(options);
          return () => {};
        },
      },
    } as never;
    const bumped: string[][] = [];
    registerProvision(ctx, provision as never, {
      bump: (facts: readonly string[]) => {
        bumped.push([...facts]);
        return { rev: bumped.length, facts: [...facts] };
      },
    });
    return { route: registered[0], bumped };
  }

  it('★ 处理器点名了哪些模块，记账就带哪些命名空间（`inventory*` 一把罩住这个模块的每一条数据事实）', async () => {
    const { route, bumped } = ledger({
      handle: () => ({ ok: true }),
      affectedUnits: () => ['inventory', 'issues'],
    });

    const { req, res } = exchange({ action: 'update-dependency', id: 'plugin:demo' });
    await route?.handler(req, res);

    expect(bumped).toEqual([['capability', 'panels', 'inventory*', 'issues*']]);
  });

  it('★ 失败也记（那一步可能已经改了机器）—— 口径与偏好写刻意不同', async () => {
    const { route, bumped } = ledger({
      handle: () => {
        throw new Error('装不上');
      },
      affectedUnits: () => ['inventory'],
    });

    const { req, res } = exchange({ action: 'install', unit: 'inventory' });
    await route?.handler(req, res);

    expect(JSON.parse(res.body)).toMatchObject({ ok: false });
    expect(bumped).toEqual([['capability', 'panels', 'inventory*']]);
  });

  it('没声明 affectedUnits 的提供者 → 退回老口径（不猜模块）', async () => {
    const { route, bumped } = ledger({ handle: () => ({ ok: true }) });

    const { req, res } = exchange({ action: 'install', unit: 'inventory' });
    await route?.handler(req, res);

    expect(bumped).toEqual([['capability', 'panels']]);
  });
});
