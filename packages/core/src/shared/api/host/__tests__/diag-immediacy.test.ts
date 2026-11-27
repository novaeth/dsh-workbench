import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DshHostContext, DshRequest, DshToolDefinition, DshToolRegistry, DshWebRoute } from '@dsh-workbench/shared/host';
import { API_PREFIX, registerApi, workbenchRoot } from '@dsh-workbench/shared/host';
import { registerDiagTools } from '@/modules/panels/model/diag-tool';
import { diagClientAction } from '../diag-client-act';
import { diagHostOf, diagRoutesOf } from '../diag-routes';

function fakeCtx(): { ctx: DshHostContext; routes: DshWebRoute[]; tools: DshToolDefinition[] } {
  const routes: DshWebRoute[] = [];
  const tools: DshToolDefinition[] = [];
  const registry = {
    register: (tool: DshToolDefinition) => {
      tools.push(tool);
      return () => undefined;
    },
  } as unknown as DshToolRegistry;
  const ctx = {
    webServer: {
      register: (route: DshWebRoute) => {
        routes.push(route);
        return () => {};
      },
    },
    get: (name: string) => (name === 'tools' ? registry : undefined),
  } as unknown as DshHostContext;
  return { ctx, routes, tools };
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

describe('诊断即时性：一次路由失败，一次工具调用', () => {
  it('★★ 面板读失败 → 回执关联号 → workbench_diag 当场命中（不重启、不重放）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-e2e-'));
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    const { ctx, routes, tools } = fakeCtx();
    const recorder = diagRoutesOf(workbenchRoot(), diagHostOf(ctx)).recorder;
    registerApi(
      ctx,
      {
        'panels/read': () => ({ ok: false, error: { code: 'read-failed', message: '适配器炸了\n第二行' } }),
      },
      recorder,
    );

    const { res, state } = fakeRes();
    await (routes[0] as DshWebRoute).handler(
      { method: 'GET', url: `${API_PREFIX}/panels/read` } as DshRequest,
      res,
    );
    const body = JSON.parse(state.body) as { diag: { corrId: string } };
    registerDiagTools(ctx);
    const tool = tools.find((one) => one.name === 'workbench_diag');
    const result = (await tool?.execute({ corrId: body.diag.corrId }, {} as never)) as Record<string, unknown>;
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    expect(body.diag.corrId).toMatch(/^[0-9a-f]{8}$/);
    const records = result['records'] as Array<{ corrId: string; code: string; area: string; subject?: { route?: string } }>;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ corrId: body.diag.corrId, code: 'READ_FAILED', area: 'panels' });
    expect(records[0]?.subject?.route).toBe('panels/read');
    expect((result['headline'] as { corrId: string }).corrId).toBe(body.diag.corrId);
    expect(result['shown']).toBe(1);
  });

  it('★★ 客户端渲染崩溃上报 → 工具按关联号看到屏幕与步骤', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-diag-client-'));
    vi.stubEnv('DSH_WORKBENCH_HOME', root);
    const { ctx, tools } = fakeCtx();
    const recorder = diagRoutesOf(workbenchRoot(), diagHostOf(ctx)).recorder;
    diagClientAction(recorder).handle({
      corrId: 'beef1234',
      screen: '面板',
      step: 'suite',
      reason: '渲染炸了\n第二行',
    });
    registerDiagTools(ctx);
    const tool = tools.find((one) => one.name === 'workbench_diag');
    const result = (await tool?.execute({ corrId: 'beef1234' }, {} as never)) as Record<string, unknown>;
    vi.stubEnv('DSH_WORKBENCH_HOME', '');
    rmSync(root, { recursive: true, force: true });

    const records = result['records'] as Array<{ code: string; corrId: string; subject?: { route?: string; unit?: string } }>;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ code: 'CLIENT_FAILED', corrId: 'beef1234' });
    expect(records[0]?.subject).toEqual({ route: '面板', unit: 'suite' });
    expect((result['headline'] as { corrId: string }).corrId).toBe('beef1234');
    expect(result['sink']).toMatchObject({ ok: true, file: { capped: false } });
  });
});
