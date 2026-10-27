import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.mock('@dsh-workbench/core/client', () => ({
  kit: {
    hooks: { useApiResource: () => ({ phase: 'loading' }) },
    components: {
      Card: () => null,
      CenteredState: () => null,
      EmptyState: () => null,
      StateBlock: () => null,
      IconPanelScreen: () => null,
      Rows: () => null,
      Row: () => null,
    },
  },
}));

import { apply, inject, name, OVERVIEW_ROUTE, readOverview } from './host';
import { apply as applyClient, inject as injectClient } from './client';

interface HostFace {
  readonly unit: string;
  mount(): { readonly routes: Record<string, (search: URLSearchParams) => Promise<unknown>> };
}

interface ClientFace {
  readonly unit: string;
  readonly card: (props: {
    readonly world: { readonly current: { readonly workspace?: { readonly path: string } | null } };
    readonly refreshToken: number;
    readonly onRefresh: () => void;
    readonly t: (key: string) => string;
  }) => unknown;
}

interface OverviewAnswer {
  readonly ok: boolean;
  readonly path: string;
  readonly files: number;
  readonly dirs: number;
  readonly bytes: number;
  readonly largest: readonly { readonly name: string; readonly bytes: number; readonly mtime: string }[];
  readonly error: { readonly code: string; readonly message: string };
}

function hostFace(): HostFace {
  const faces: unknown[] = [];
  const ctx = {
    get: () => ({
      register: (face: unknown) => {
        faces.push(face);
        return () => {};
      },
    }),
    effect: (effect: () => void | (() => void)) => {
      effect();
      return () => {};
    },
    logger: { warn: () => {} },
  };
  apply(ctx as never);
  return faces[0] as HostFace;
}

function clientFace(): ClientFace {
  const faces: unknown[] = [];
  const ctx = {
    get: () => ({
      registerUnit: (face: unknown) => {
        faces.push(face);
        return () => {};
      },
    }),
    effect: (effect: () => void | (() => void)) => {
      effect();
      return () => {};
    },
  };
  applyClient(ctx as never);
  return faces[0] as ClientFace;
}

function overview(search: Record<string, string>): Promise<unknown> {
  return hostFace().mount().routes[OVERVIEW_ROUTE](new URLSearchParams(search));
}

const scratch = mkdtempSync(join(tmpdir(), 'dsh-wb-diy-'));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('__NAME__ 的面', () => {
  it('插件名就是包名', () => {
    expect(name).toBe('__NAME__');
  });

  it('两侧都只注入外壳交出来的那个服务', () => {
    expect(inject).toEqual(['workbenchUnits']);
    expect(injectClient).toEqual(['workbenchUnits']);
  });

  it('宿主半侧与浏览器半侧都把自己的面注册进外壳', () => {
    expect(hostFace().unit).toBe('__UNIT__');
    expect(clientFace().unit).toBe('__UNIT__');
  });
});

describe('宿主侧的只读路由', () => {
  it('路由住在自己那一格的命名空间里，且是个 async handler', () => {
    const routes = hostFace().mount().routes;
    expect(Object.keys(routes)).toEqual([OVERVIEW_ROUTE]);
    expect(OVERVIEW_ROUTE).toBe('__UNIT__/overview');
    expect(typeof routes[OVERVIEW_ROUTE]).toBe('function');
  });

  it('真读一个目录：文件数 / 目录数 / 总字节 / 最大的几个文件（名字 + 字节 + mtime）', async () => {
    const dir = join(scratch, 'sample');
    mkdirSync(join(dir, 'nested'), { recursive: true });
    writeFileSync(join(dir, 'small.txt'), 'x'.repeat(10));
    writeFileSync(join(dir, 'mid.log'), 'y'.repeat(50));
    writeFileSync(join(dir, 'big.bin'), 'z'.repeat(100));

    const answer = (await overview({ path: dir, limit: '2' })) as OverviewAnswer;
    expect(answer.ok).toBe(true);
    expect(answer.path).toBe(dir);
    expect(answer.files).toBe(3);
    expect(answer.dirs).toBe(1);
    expect(answer.bytes).toBe(160);
    expect(answer.largest.map((file) => file.name)).toEqual(['big.bin', 'mid.log']);
    expect(answer.largest[0]?.bytes).toBe(100);
    expect(answer.largest[0]?.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('limit 由查询参数管，越界会夹住', async () => {
    const dir = join(scratch, 'sample');
    const answer = (await overview({ path: dir, limit: '0' })) as OverviewAnswer;
    expect(answer.largest).toHaveLength(1);
  });

  it('path 缺省时回 ok:false 的 no-path，而不是偷偷读宿主进程的工作目录', async () => {
    const answer = (await overview({})) as OverviewAnswer;
    expect(answer.ok).toBe(false);
    expect(answer.error.code).toBe('no-path');
  });

  it('读不到时交回 ok:false 的 error，而不是抛出去', async () => {
    const answer = (await overview({ path: join(scratch, 'nope') })) as OverviewAnswer;
    expect(answer.ok).toBe(false);
    expect(answer.error.code).toBe('overview-unreadable');
    expect(answer.error.message.length).toBeGreaterThan(0);
  });

  it('readOverview 与路由返回的是同一份读数', () => {
    expect(readOverview(join(scratch, 'sample'), 5).bytes).toBe(160);
  });
});
