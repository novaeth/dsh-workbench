import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { OverviewFile, OverviewPayload } from './model/overview';

const UNIT_ID = '__UNIT__';
const PLUGIN_ID = '__NAME__';
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

export const OVERVIEW_ROUTE = `${UNIT_ID}/overview`;

export type RouteHandler = (search: URLSearchParams) => Promise<unknown> | unknown;

export function readOverview(path: string, limit: number): OverviewPayload {
  const entries = readdirSync(path, { withFileTypes: true });
  const files: OverviewFile[] = [];
  let dirs = 0;
  let bytes = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      dirs += 1;
      continue;
    }
    if (!entry.isFile()) continue;
    const info = statSync(join(path, entry.name));
    bytes += info.size;
    files.push({ name: entry.name, bytes: info.size, mtime: new Date(info.mtimeMs).toISOString() });
  }
  files.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
  return { path, files: files.length, dirs, bytes, largest: files.slice(0, limit) };
}

function searchParam(search: URLSearchParams, name: string): string | undefined {
  const raw = search.get(name);
  return raw === null || raw === '' ? undefined : raw;
}

function limitOf(search: URLSearchParams): number {
  const raw = searchParam(search, 'limit');
  if (raw === undefined) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(parsed)));
}

interface UnitModuleFace {
  readonly unit: string;
  mount(): { routes: Record<string, RouteHandler>; registerTools(): Array<() => void> };
}

interface UnitRegistry {
  register(face: UnitModuleFace): () => void;
}

interface HostContext {
  get<T = unknown>(name: string): T | undefined;
  effect(effect: () => void | (() => void), label?: string): () => void;
  logger?: { warn?(message: string): void } | undefined;
}

const face: UnitModuleFace = {
  unit: UNIT_ID,
  mount: () => ({
    routes: {
      [OVERVIEW_ROUTE]: async (search: URLSearchParams) => {
        const target = searchParam(search, 'path');
        if (target === undefined) {
          return { ok: false, error: { code: 'no-path', message: '没告诉我要看哪个目录' } };
        }
        try {
          return { ok: true, ...readOverview(target, limitOf(search)) };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: 'overview-unreadable',
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      },
    },
    registerTools: () => [],
  }),
};

export const name = PLUGIN_ID;

export const inject = ['workbenchUnits'];

export function apply(ctx: HostContext): void {
  const units = ctx.get<UnitRegistry>('workbenchUnits');
  if (units === undefined) {
    ctx.logger?.warn?.(`[${UNIT_ID}] 外壳没有提供 workbenchUnits 服务：这个模块装不进来`);
    return;
  }
  ctx.effect(() => units.register(face), `${PLUGIN_ID}: 注册 ${UNIT_ID}`);
}
