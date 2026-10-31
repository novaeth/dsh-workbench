import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { DshToolDefinition } from '@dsh-workbench/core/contract';
import { createFlowHost, createLongTaskHost, type LongTaskBase } from '@dsh-workbench/shared/host';

vi.mock('@dsh-workbench/core/client', () => ({
  kit: {
    hooks: {
      useApiResource: () => ({ phase: 'loading' }),
      useHostWrite: () => ({
        busy: false,
        failed: null,
        detail: null,
        send: async () => ({ ok: true, value: {} }),
        fail: () => {},
        clear: () => {},
      }),
      useLongTask: () => ({
        runs: [],
        stop: async () => ({ ok: true }),
        stopping: null,
        stopFailed: null,
        refresh: () => {},
      }),
    },
    components: {
      Card: () => null,
      CenteredState: () => null,
      EmptyState: () => null,
      StateBlock: () => null,
      IconPanelScreen: () => null,
      Rows: () => null,
      Row: () => null,
      LongTaskRow: () => null,
      Note: () => null,
    },
  },
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: () => null,
}));

import { apply, inject, name, OVERVIEW_ROUTE, readOverview } from '../host';
import { apply as applyClient, inject as injectClient } from '../client';
import { DECLARED_TOOLS } from '../declared-tools';
import { RUN_RESOURCE } from '../model/flow';
import { NOTES_ROUTE, NOTE_RESOURCE } from '../model/notes';
import { PREFS_RESOURCE, PREFS_ROUTE } from '../model/prefs';

interface Mounted {
  readonly routes: Record<string, (search: URLSearchParams) => Promise<unknown>>;
  registerTools(): Array<() => void>;
  readonly longTasks?: {
    snapshot(id: string): LongTaskBase | null;
    stop(id: string): boolean;
  };
  readonly actions?: readonly { readonly resource: string; handle(payload: unknown): unknown }[];
  readonly prefs?: { readonly resource: string; handle(payload: unknown): unknown };
  needsApproval?(call: { readonly name?: string; readonly arguments?: unknown }): unknown;
  approvalDetail?(call: { readonly name?: string; readonly arguments?: unknown }): unknown;
}

interface HostFace {
  readonly unit: string;
  mount(deps: unknown): Mounted;
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

interface Harness {
  readonly mounted: Mounted;
  readonly tools: DshToolDefinition[];
}

const scratch = mkdtempSync(join(tmpdir(), 'dsh-wb-diy-'));
mkdirSync(join(scratch, 'sample', 'nested'), { recursive: true });
writeFileSync(join(scratch, 'sample', 'small.txt'), 'x'.repeat(10));
writeFileSync(join(scratch, 'sample', 'mid.log'), 'y'.repeat(50));
writeFileSync(join(scratch, 'sample', 'big.bin'), 'z'.repeat(100));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function harness(): Harness {
  const tools: DshToolDefinition[] = [];
  const longTasks = createLongTaskHost({ scope: 'plugin-test', unit: '__UNIT__', bump: () => {} });
  const files = new Map<string, Map<string, unknown>>();
  const storeFor = (workspace: string | null) => {
    const key = workspace ?? '';
    const at = files.get(key) ?? new Map<string, unknown>();
    files.set(key, at);
    return {
      read: (name: string) => at.get(name) ?? null,
      write: (name: string, value: unknown) => {
        at.set(name, value);
      },
      remove: (name: string) => {
        at.delete(name);
      },
      list: () => [...at.keys()],
    };
  };
  const ctx = {
    get: (target: string) =>
      target === 'tools'
        ? {
            register(tool: DshToolDefinition) {
              tools.push(tool);
              return () => {};
            },
          }
        : undefined,
    effect: (effect: () => void | (() => void)) => {
      effect();
      return () => {};
    },
    logger: { warn: () => {} },
  };
  const deps = {
    ctx,
    logger: { warn: () => {} },
    flow: createFlowHost(),
    longTasks: longTasks.host,
    store: { for: (_unit: string, workspace: string | null) => storeFor(workspace), machine: () => storeFor(null), scan: () => [] },
    sessionIdOf: () => 'session-1',
    sessionWorkspace: () => join(scratch, 'sample'),
  };
  return { mounted: hostFace().mount(deps), tools };
}

function toolOf(h: Harness, name: string): DshToolDefinition | undefined {
  return h.tools.find((tool) => tool.name === name);
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
  return faces[0] as unknown as HostFace;
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
  return harness().mounted.routes[OVERVIEW_ROUTE](new URLSearchParams(search));
}

async function settled(h: Harness, id: string): Promise<LongTaskBase | null> {
  for (let step = 0; step < 100; step += 1) {
    const snapshot = h.mounted.longTasks?.snapshot(id) ?? null;
    if (snapshot === null || snapshot.status !== 'running') return snapshot;
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  return h.mounted.longTasks?.snapshot(id) ?? null;
}

const execContext = {
  agent: { session: { id: 'session-1', header: { cwd: join(scratch, 'sample') } } },
};

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
  it('三条路由都住在自己那一格的命名空间里（键以 <unit>/ 开头），且都是 handler', () => {
    const routes = harness().mounted.routes;
    expect(Object.keys(routes)).toEqual([OVERVIEW_ROUTE, NOTES_ROUTE, PREFS_ROUTE]);
    expect(typeof routes[OVERVIEW_ROUTE]).toBe('function');
  });

  it('真读一个目录：文件数 / 目录数 / 总字节 / 最大的几个文件（名字 + 字节 + mtime）', async () => {
    const answer = (await overview({ path: join(scratch, 'sample'), limit: '2' })) as OverviewAnswer;
    expect(answer.ok).toBe(true);
    expect(answer.path).toBe(join(scratch, 'sample'));
    expect(answer.files).toBe(3);
    expect(answer.dirs).toBe(1);
    expect(answer.bytes).toBe(160);
    expect(answer.largest.map((file) => file.name)).toEqual(['big.bin', 'mid.log']);
    expect(answer.largest[0]?.bytes).toBe(100);
    expect(answer.largest[0]?.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('limit 由查询参数管，越界会夹住', async () => {
    const answer = (await overview({ path: join(scratch, 'sample'), limit: '0' })) as OverviewAnswer;
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

describe('宿主侧的长任务与工具', () => {
  it('registerTools() 调用时注册两把、返回 disposers，工具名与清单对得上', () => {
    const h = harness();
    const disposers = h.mounted.registerTools();
    expect(h.tools.map((tool) => tool.name)).toEqual([DECLARED_TOOLS.run.name, DECLARED_TOOLS.addNote.name]);
    expect(disposers).toHaveLength(2);
    expect(disposers.every((one) => typeof one === 'function')).toBe(true);
  });

  it('只读工具能起一趟流程，长任务最后落到 ok，步骤是真的', async () => {
    const h = harness();
    h.mounted.registerTools();
    const tool = toolOf(h, DECLARED_TOOLS.run.name);
    const started = (await tool?.execute({}, execContext)) as { ok: boolean; runId: string };
    expect(started.ok).toBe(true);
    const snapshot = await settled(h, started.runId);
    expect(snapshot?.status).toBe('ok');
    expect(snapshot?.steps.length).toBeGreaterThan(0);
  });

  it('按 runId 再看时回同一趟，不新起', async () => {
    const h = harness();
    h.mounted.registerTools();
    const tool = toolOf(h, DECLARED_TOOLS.run.name);
    const started = (await tool?.execute({}, execContext)) as { ok: boolean; runId: string };
    await settled(h, started.runId);
    const again = (await tool?.execute({ runId: started.runId }, {})) as { ok: boolean; runId: string };
    expect(again.runId).toBe(started.runId);
  });

  it('动作通道也能起同一趟（卡片那颗钮走的就是它）', async () => {
    const h = harness();
    const action = h.mounted.actions?.find((one) => one.resource === RUN_RESOURCE);
    const started = action?.handle({ path: join(scratch, 'sample') }) as { ok: boolean; runId: string };
    expect(started.ok).toBe(true);
    expect((await settled(h, started.runId))?.status).toBe('ok');
  });

  it('没有工作区时工具说清楚，不抛', async () => {
    const h = harness();
    h.mounted.registerTools();
    const answer = (await toolOf(h, DECLARED_TOOLS.run.name)?.execute({}, {})) as { ok: boolean; text: string };
    expect(answer.ok).toBe(false);
    expect(answer.text).toContain('工作区');
  });
});

describe('写通道：笔记 + 审批', () => {
  it('笔记默认是空的；动作通道写一条后读得到', () => {
    const h = harness();
    const path = join(scratch, 'sample');
    const readNotes = (): { notes: { text: string }[] } =>
      h.mounted.routes[NOTES_ROUTE](new URLSearchParams({ path })) as unknown as { notes: { text: string }[] };
    expect(readNotes().notes).toEqual([]);
    const action = h.mounted.actions?.find((one) => one.resource === NOTE_RESOURCE);
    expect(action?.handle({ path, text: '  第一条  ' })).toMatchObject({ ok: true });
    const notes = readNotes().notes;
    expect(notes).toHaveLength(1);
    expect(notes[0]?.text).toBe('第一条');
  });

  it('工具写同一份笔记；空文本回 ok:false，不写', async () => {
    const h = harness();
    h.mounted.registerTools();
    const tool = toolOf(h, DECLARED_TOOLS.addNote.name);
    const answer = (await tool?.execute({ text: 'agent 记的' }, execContext)) as { ok: boolean };
    expect(answer.ok).toBe(true);
    const bad = (await tool?.execute({ text: '  ' }, execContext)) as { ok: boolean };
    expect(bad.ok).toBe(false);
    const notes = h.mounted.routes[NOTES_ROUTE](
      new URLSearchParams({ path: join(scratch, 'sample') }),
    ) as unknown as { notes: { text: string }[] };
    expect(notes.notes.map((one) => one.text)).toContain('agent 记的');
  });

  it('写工具要点头：needsApproval 回 ask，approvalDetail 说清写什么', () => {
    const h = harness();
    const verdict = h.mounted.needsApproval?.({
      name: DECLARED_TOOLS.addNote.name,
      arguments: { text: 'x' },
    }) as { kind: string; question?: { zh?: string; en?: string } };
    expect(verdict?.kind).toBe('ask');
    expect(verdict?.question?.zh).toBeTruthy();
    expect(verdict?.question?.en).toBeTruthy();
    expect(
      h.mounted.approvalDetail?.({ name: DECLARED_TOOLS.addNote.name, arguments: { text: 'x' } }),
    ).toMatchObject({ zh: expect.any(String), en: expect.any(String) });
  });

  it('只读工具不被问（kind: read）', () => {
    const h = harness();
    expect(h.mounted.needsApproval?.({ name: DECLARED_TOOLS.run.name, arguments: {} })).toEqual({
      kind: 'read',
    });
  });

  it('没有工作区时写动作说清楚，不抛', () => {
    const h = harness();
    const action = h.mounted.actions?.find((one) => one.resource === NOTE_RESOURCE);
    expect(action?.handle({ text: 'x' })).toMatchObject({ ok: false });
  });
});

describe('配置：按工作区存 limit', () => {
  it('默认 5；写出后读回同一个值，另一个工作区不受影响', () => {
    const h = harness();
    const a = join(scratch, 'sample');
    const b = scratch;
    const limitAt = (path: string): number =>
      (
        h.mounted.routes[PREFS_ROUTE](new URLSearchParams({ path })) as unknown as {
          prefs: { limit: number };
        }
      ).prefs.limit;
    expect(limitAt(a)).toBe(5);
    expect(h.mounted.prefs?.handle({ workspace: a, limit: 20 })).toMatchObject({ prefs: { limit: 20 } });
    expect(limitAt(a)).toBe(20);
    expect(limitAt(b)).toBe(5);
  });

  it('越界偏好会抛，原值不变', () => {
    const h = harness();
    const a = join(scratch, 'sample');
    expect(() => h.mounted.prefs?.handle({ workspace: a, limit: 999 })).toThrow('只认');
    const limit = (
      h.mounted.routes[PREFS_ROUTE](new URLSearchParams({ path: a })) as unknown as {
        prefs: { limit: number };
      }
    ).prefs.limit;
    expect(limit).toBe(5);
  });

describe('写完之后去哪、细节能不能上屏', () => {
  it('factsOf 认得工具与动作资源；只读工具不连带刷目录', () => {
    const h = harness();
    const factsOf = (h.mounted as unknown as { factsOf?: (call: { source: string }) => readonly string[] | undefined }).factsOf;
    expect(factsOf?.({ source: DECLARED_TOOLS.addNote.name })).toEqual([NOTES_ROUTE]);
    expect(factsOf?.({ source: NOTE_RESOURCE })).toEqual([NOTES_ROUTE]);
    expect(factsOf?.({ source: PREFS_RESOURCE })).toEqual([PREFS_ROUTE]);
    expect(factsOf?.({ source: DECLARED_TOOLS.run.name })).toEqual([]);
  });

  it('只读工具的 approvalDetail 不给明细', () => {
    const h = harness();
    expect(h.mounted.approvalDetail?.({ name: DECLARED_TOOLS.run.name, arguments: {} })).toBeUndefined();
  });
});

describe('配置写的返回契约', () => {
  it('写成功回 ok:true（浏览器侧按顶层 ok 判成功）', () => {
    const h = harness();
    const answer = h.mounted.prefs?.handle({ workspace: join(scratch, 'sample'), limit: 10 }) as {
      ok: boolean;
      prefs: { limit: number };
    };
    expect(answer.ok).toBe(true);
    expect(answer.prefs.limit).toBe(10);
  });

  it('没带工作区：清楚拒绝，不落进内存 store', () => {
    const h = harness();
    expect(h.mounted.prefs?.handle({ limit: 10 })).toMatchObject({ ok: false });
  });
});

describe('笔记 id 在满额后仍然唯一', () => {
  it('连写 21 条：id 不重复，只留最新 20 条', () => {
    const h = harness();
    const path = join(scratch, 'sample');
    const action = h.mounted.actions?.find((one) => one.resource === NOTE_RESOURCE);
    for (let index = 0; index < 21; index += 1) {
      action?.handle({ path, text: `第 ${String(index)} 条` });
    }
    const notes = h.mounted.routes[NOTES_ROUTE](new URLSearchParams({ path })) as unknown as {
      notes: { id: string; text: string }[];
    };
    expect(notes.notes).toHaveLength(20);
    expect(new Set(notes.notes.map((one) => one.id)).size).toBe(20);
    expect(notes.notes[0]?.text).toBe('第 20 条');
  });
});

});
