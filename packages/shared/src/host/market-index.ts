import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type {
  MarketIndex,
  MarketIndexEntry,
  MarketIndexProblem,
  MarketIndexVersion,
} from '../contract/protocol/market-index.js';
import { MARKET_INDEX_DIR, MARKET_INDEX_FORMAT } from '../contract/protocol/market-index.js';

import type {
  MarketDocFields,
  MarketEntryDoc,
  MarketEntryFile,
  MarketIndexAssemble,
  MarketMetaDoc,
  MarketVersionDoc,
} from './market-index-doc.js';
import {
  marketEntryPath,
  parseMarketEntryDoc,
  parseMarketIndexJson,
  sortMarketVersions,
} from './market-index-parse.js';

export const MARKET_ENTRIES_README_LINES: readonly string[] = [
  '# 索引目录',
  '',
  '一个包一个目录，一个版本一个文件：`market/<包名>/<版本>.json`（只放版本与来源）；产物在 `artifacts/<包名>/<版本>/`。',
  '',
  '元数据只住 `meta-<epoch>-<随机后缀>.json`（首次发布或 refresh 时写），读取时按 epoch 取最新的一份；版本文件里不重复存。',
];

export const MARKET_INDEX_README_LINES: readonly string[] = [
  '# 模块市场索引',
  '',
  '这个仓库给 DeepSeek Harness 工作台当模块市场索引：条目在 `market/<包名>/<版本>.json`，产物在 `artifacts/<包名>/<版本>/`。',
  '',
  '## 发布模块',
  '',
  '在模块包里运行：',
  '',
  '```bash',
  'dsh-wb-module release --index <本仓库地址> --index-policy artifacts-in-repo',
  '```',
  '',
  '产物会提交到 `artifacts/<包名>/<版本>/`，条目提交到 `market/<包名>/<版本>.json`。',
  '发布只新增文件、不改已有文件，两台机器同时发也不会冲突；老条目的 `packages/<包名>/` 路径继续可用。',
  '',
  '一个包名归第一次发布的人（条目文件里的 `owner`）。换一个署名发同名会被拒；要换人，先把这一条的 `owner` 改成新的人。',
  '同一个市场里，一个模块 id（`metadata.unit`）只能被一个条目使用；另一个包名想用同一个 id / 产物目录也会被拒。',
  '',
  '## 使用这个索引',
  '',
  '在工作台的「模块市场 → 发现」里添加本仓库地址，即可浏览与安装。',
  '',
];
export { marketBranchOk, marketInstallTarget, marketText } from '../lib/market-index.js';
export type {
  MarketEntryDoc,
  MarketEntryDocParse,
  MarketEntryFile,
  MarketIndexAssemble,
  MarketMetaDoc,
  MarketVersionDoc,
} from './market-index-doc.js';
import { marketMetaPath } from './market-index-parse.js';
import { entryUnitOf } from './market-index-claim.js';

export {
  compareSemver,
  filterMarketIndex,
  gitUrlOk,
  httpUrlProblem,
  marketEntryLabels,
  marketEntryPath,
  marketMetaPath,
  marketSourceKey,
  parseMarketEntryDoc,
  parseMarketIndex,
  parseMarketIndexJson,
  parseSourceConfig,
  sortMarketVersions,
  upsertMarketEntry,
} from './market-index-parse.js';
export type { SourceConfigParse } from './market-index-parse.js';


function problem(kind: MarketIndexProblem['kind'], detail: string, at?: string): MarketIndexProblem {
  return { kind, detail, ...(at === undefined ? {} : { at }) };
}

function docFieldsFromEntry(entry: MarketIndexEntry): MarketDocFields {
  return {
    name: entry.name,
    ...(entry.title === undefined ? {} : { title: entry.title }),
    ...(entry.description === undefined ? {} : { description: entry.description }),
    ...(entry.author === undefined ? {} : { author: entry.author }),
    ...(entry.owner === undefined ? {} : { owner: entry.owner }),
    ...(entry.homepage === undefined ? {} : { homepage: entry.homepage }),
    ...(entry.icon === undefined ? {} : { icon: entry.icon }),
    ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
  };
}

export function marketVersionDocOf(entry: MarketIndexEntry, version: MarketIndexVersion): MarketVersionDoc {
  return { ...docFieldsFromEntry(entry), ...version };
}

export function marketVersionDocLeanOf(entry: MarketIndexEntry, version: MarketIndexVersion): MarketVersionDoc {
  return { name: entry.name, ...version };
}

function hasMetaFields(doc: MarketEntryDoc | MarketIndexEntry): boolean {
  return (
    doc.title !== undefined ||
    doc.description !== undefined ||
    doc.author !== undefined ||
    doc.owner !== undefined ||
    doc.homepage !== undefined ||
    doc.icon !== undefined ||
    doc.metadata !== undefined
  );
}

export function marketMetaDocOf(entry: MarketIndexEntry, epoch: number, at: number): MarketMetaDoc {
  return { ...docFieldsFromEntry(entry), epoch, publishTimestamp: at };
}

export function assembleMarketIndex(files: readonly MarketEntryFile[]): MarketIndexAssemble {
  const problems: MarketIndexProblem[] = [];
  interface Group {
    versions: Map<string, MarketIndexVersion>;
    meta: { epoch: number; at: number; path: string; doc: MarketEntryDoc } | undefined;
    fallback: { at: number; path: string; doc: MarketEntryDoc } | undefined;
  }
  const groups = new Map<string, Group>();
  const ordered = [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  for (const file of ordered) {
    let raw: unknown;
    try {
      raw = JSON.parse(file.text) as unknown;
    } catch (error) {
      problems.push(
        problem('not-json', `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`, file.path),
      );
      continue;
    }
    const parsed = parseMarketEntryDoc(raw);
    if (!parsed.ok) {
      for (const one of parsed.problems) problems.push({ ...one, at: file.path });
      continue;
    }
    const doc = parsed.doc;
    const group =
      groups.get(doc.name) ?? { versions: new Map<string, MarketIndexVersion>(), meta: undefined, fallback: undefined };
    const at = doc.publishTimestamp ?? 0;
    if ('version' in doc) {
      if (group.versions.has(doc.version)) {
        problems.push(problem('duplicate-version', `版本重复：${doc.version}`, file.path));
      }
      group.versions.set(doc.version, {
        version: doc.version,
        source: doc.source,
        ...(doc.publishTimestamp === undefined ? {} : { publishTimestamp: doc.publishTimestamp }),
        ...(doc.engines === undefined ? {} : { engines: doc.engines }),
      });
      const newerFallback =
        hasMetaFields(doc) &&
        (group.fallback === undefined ||
          at > group.fallback.at ||
          (at === group.fallback.at && file.path > group.fallback.path));
      if (newerFallback) group.fallback = { at, path: file.path, doc };
    } else {
      const epoch = doc.epoch ?? 0;
      const newer =
        group.meta === undefined ||
        epoch > group.meta.epoch ||
        (epoch === group.meta.epoch && at > group.meta.at) ||
        (epoch === group.meta.epoch && at === group.meta.at && file.path > group.meta.path);
      if (newer) group.meta = { epoch, at, path: file.path, doc };
    }
    groups.set(doc.name, group);
  }
  if (problems.length > 0) return { ok: false, problems };
  const plugins: MarketIndexEntry[] = [...groups.entries()].map(([name, group]) => {
    const meta = group.meta?.doc ?? group.fallback?.doc;
    return {
      name,
      versions: sortMarketVersions([...group.versions.values()]),
      ...(meta?.title === undefined ? {} : { title: meta.title }),
      ...(meta?.description === undefined ? {} : { description: meta.description }),
      ...(meta?.author === undefined ? {} : { author: meta.author }),
      ...(meta?.owner === undefined ? {} : { owner: meta.owner }),
      ...(meta?.homepage === undefined ? {} : { homepage: meta.homepage }),
      ...(meta?.icon === undefined ? {} : { icon: meta.icon }),
      ...(meta?.metadata === undefined ? {} : { metadata: meta.metadata }),
    };
  });
  plugins.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return { ok: true, index: { format: MARKET_INDEX_FORMAT, plugins } };
}

export function marketEntryFilesOf(index: MarketIndex, dir: string = MARKET_INDEX_DIR): readonly MarketEntryFile[] {
  const files: MarketEntryFile[] = [];
  for (const entry of index.plugins) {
    for (const version of entry.versions) {
      files.push({
        path: marketEntryPath(dir, entry.name, version.version),
        text: `${JSON.stringify(marketVersionDocLeanOf(entry, version), null, 2)}\n`,
      });
    }
    const unit = entry.metadata?.unit ?? entryUnitOf(entry);
    const healed = unit === undefined ? entry : { ...entry, metadata: { ...entry.metadata, unit } };
    if (!hasMetaFields(healed)) continue;
    const at = entry.versions.reduce((latest, one) => Math.max(latest, one.publishTimestamp ?? 0), 0);
    files.push({
      path: marketMetaPath(dir, entry.name, 1, 'migr'),
      text: `${JSON.stringify(marketMetaDocOf(healed, 1, at), null, 2)}\n`,
    });
  }
  return files;
}

export function collectMarketEntryFiles(dir: string): readonly MarketEntryFile[] {
  if (!existsSync(dir)) return [];
  const files: MarketEntryFile[] = [];
  const walk = (current: string): void => {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, item.name);
      if (item.isDirectory()) {
        walk(full);
        continue;
      }
      if (!item.name.endsWith('.json')) continue;
      files.push({ path: relative(dir, full).split(sep).join('/'), text: readFileSync(full, 'utf8') });
    }
  };
  walk(dir);
  return files;
}

export function marketEntryFilesOfLegacy(text: string, dir: string = MARKET_INDEX_DIR): readonly MarketEntryFile[] | undefined {
  const parsed = parseMarketIndexJson(text);
  if (!parsed.ok) return undefined;
  return marketEntryFilesOf(parsed.index, dir);
}
