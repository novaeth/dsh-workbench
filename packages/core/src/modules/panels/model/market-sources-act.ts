import type {
  MarketSourceConfig,
  MarketSourcesAction,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_SOURCES_RESOURCE, MARKET_SOURCES_ROUTE } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { RouteTable } from '@dsh-workbench/shared/host';
import { marketBranchOk, parseSourceConfig } from '@dsh-workbench/shared/host';
import type { MarketSourceInitializer } from '@/shared/api/host/market-source-init';
import type { MarketSourcesStore } from '@/shared/api/host/market-sources-store';

export const MARKET_SOURCES_ACTION_RESOURCE = MARKET_SOURCES_RESOURCE;

export function marketSourcesRoutes(store: MarketSourcesStore): RouteTable {
  return {
    [MARKET_SOURCES_ROUTE]: async () => ({ ok: true, ...store.read() }),
  };
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

export function parseMarketSourcesAction(payload: unknown): MarketSourcesAction {
  const record = asRecord(payload);
  if (record === undefined) throw new Error('索引源写需要一个对象：{ action, source? , id? }');
  const action = record['action'];
  if (action === 'save') {
    const parsed = parseSourceConfig(record['source']);
    if (!parsed.ok) throw new Error(parsed.problem.detail);
    return { action, source: parsed.source, ...(record['select'] === true ? { select: true } : {}) };
  }
  if (action === 'remove') {
    const id = record['id'];
    if (typeof id !== 'string' || id.trim() === '') throw new Error('remove 需要 id');
    return { action, id: id.trim() };
  }
  if (action === 'select') {
    const id = record['id'];
    if (id === null) return { action, id: null };
    if (typeof id !== 'string' || id.trim() === '') throw new Error('select 需要 id 或 null');
    return { action, id: id.trim() };
  }
  if (action === 'read-only') {
    const id = record['id'];
    if (typeof id !== 'string' || id.trim() === '') throw new Error('read-only 需要 id');
    return { action, id: id.trim() };
  }
  if (action === 'init') {
    const id = record['id'];
    if (typeof id !== 'string' || id.trim() === '') throw new Error('init 需要 id');
    const ref = typeof record['ref'] === 'string' ? record['ref'].trim() : '';
    if (ref !== '' && !marketBranchOk(ref)) throw new Error(`分支名不合格：${ref}`);
    const stampOnly = record['stampOnly'] === true;
    return { action, id: id.trim(), ...(ref === '' ? {} : { ref }), ...(stampOnly ? { stampOnly } : {}) };
  }
  throw new Error(`不认识的索引源动作：${String(action)}`);
}

export async function markSourceReadOnly(
  store: MarketSourcesStore,
  id: string,
): Promise<MarketSourceConfig> {
  const source = store.read().sources.find((one) => one.id === id);
  if (source === undefined) throw new Error('这个索引源已经不在了 —— 刷新后再试');
  if (source.kind !== 'git') throw new Error('http 索引源本来就是只读');
  const next: MarketSourceConfig = { ...source, policy: 'catalog-only' };
  if (source.policy !== 'catalog-only') await store.apply({ action: 'save', source: next });
  return next;
}

export function marketSourcesAction(
  store: MarketSourcesStore,
  init?: MarketSourceInitializer | undefined,
): {
  readonly resource: string;
  handle(payload: unknown): Promise<unknown>;
} {
  return {
    resource: MARKET_SOURCES_RESOURCE,
    async handle(payload) {
      const action = parseMarketSourcesAction(payload);
      if (action.action === 'read-only') {
        const source = await markSourceReadOnly(store, action.id);
        return { ok: true, ...store.read(), source };
      }
      if (action.action === 'init') {
        if (init === undefined) throw new Error('这台机器上没有 shell 服务，初始化不了索引仓库');
        const result = await init({
          id: action.id,
          ...(action.ref === undefined ? {} : { ref: action.ref }),
          ...(action.stampOnly === true ? { stampOnly: true } : {}),
        });
        return { ok: true, ...store.read(), branch: result.branch, commit: result.commit, created: result.created };
      }
      const result = await store.apply(action);
      return { ok: true, ...result };
    },
  };
}
