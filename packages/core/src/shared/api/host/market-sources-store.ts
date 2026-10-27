import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import writeFileAtomic from 'write-file-atomic';
import type {
  MarketSourceConfig,
  MarketSourcesAction,
  MarketSourcesPayload,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import { parseSourceConfig } from '@dsh-workbench/shared/host';

export type MarketSourcesWrite = Exclude<
  MarketSourcesAction,
  { readonly action: 'init' } | { readonly action: 'read-only' }
>;

export interface MarketSourcesStore {
  read(): MarketSourcesPayload;
  apply(action: MarketSourcesWrite): Promise<MarketSourcesPayload>;
}

export interface MarketSourcesStoreOptions {
  readonly root: string;
  readonly logger?: { warn?(message: string): void } | undefined;
}

function fileOf(root: string): string {
  return join(root, 'market-index', 'sources.json');
}

function readPayload(path: string, logger?: { warn?(message: string): void }): MarketSourcesPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { sources: [], selected: null };
  }
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(record['sources']) ? record['sources'] : [];
  const sources: MarketSourceConfig[] = [];
  for (const item of list) {
    const parsed = parseSourceConfig(item);
    if (!parsed.ok) {
      logger?.warn?.(`[dsh-workbench] 丢掉一个不合格的索引源：${parsed.problem.detail}`);
      continue;
    }
    sources.push(parsed.source);
  }
  const selectedRaw = record['selected'];
  const selected =
    typeof selectedRaw === 'string' && sources.some((source) => source.id === selectedRaw)
      ? selectedRaw
      : (sources[0]?.id ?? null);
  return { sources, selected };
}

async function writePayload(path: string, payload: MarketSourcesPayload): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await writeFileAtomic(path, `${JSON.stringify(payload, null, 2)}\n`);
}

function upsert(sources: readonly MarketSourceConfig[], source: MarketSourceConfig): MarketSourceConfig[] {
  const found = sources.findIndex((item) => item.id === source.id);
  if (found === -1) return [...sources, source];
  const next = [...sources];
  next[found] = source;
  return next;
}

export function createMarketSourcesStore(options: MarketSourcesStoreOptions): MarketSourcesStore {
  const path = fileOf(options.root);

  function read(): MarketSourcesPayload {
    return readPayload(path, options.logger);
  }

  async function apply(action: MarketSourcesWrite): Promise<MarketSourcesPayload> {
    const current = read();
    if (action.action === 'save') {
      const parsed = parseSourceConfig(action.source);
      if (!parsed.ok) throw new Error(parsed.problem.detail);
      const sources = upsert(current.sources, parsed.source);
      const selected = action.select === true ? parsed.source.id : current.selected;
      const payload: MarketSourcesPayload = { sources, selected: selected ?? parsed.source.id };
      await writePayload(path, payload);
      return payload;
    }
    if (action.action === 'remove') {
      const sources = current.sources.filter((source) => source.id !== action.id);
      const selected = current.selected === action.id ? (sources[0]?.id ?? null) : current.selected;
      const payload: MarketSourcesPayload = { sources, selected };
      await writePayload(path, payload);
      return payload;
    }
    const selected =
      action.id === null ? null : current.sources.some((source) => source.id === action.id) ? action.id : current.selected;
    const payload: MarketSourcesPayload = { sources: current.sources, selected };
    await writePayload(path, payload);
    return payload;
  }

  return { read, apply };
}
