import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { MarketIndex, MarketIndexEntry, MarketIndexProblem } from '../contract/protocol/market-index.js';
import { MARKET_INDEX_DIR, MARKET_INDEX_FORMAT } from '../contract/protocol/market-index.js';
import type { MarketEntryFile, MarketIndexAssemble } from './market-index-doc.js';
import { entryUnitOf } from './market-index-claim.js';
import { marketEntryPath, parseMarketEntryJson, parseMarketIndexJson, sortMarketVersions } from './market-index-parse.js';

export const MARKET_ENTRIES_README_LINES: readonly string[] = [
  '# 索引目录',
  '',
  '一个包一个文件：`market/<包名>.json`，里面是这一个包的元数据与所有版本；',
  '',
  '产物在 `artifacts/<包名>/`（只放最新一版，老版本按条目里的 commit 取历史）。',
  '',
  '发布时只改自己包的文件；包与包之间不共享文件。',
];

export const MARKET_INDEX_README_LINES: readonly string[] = [
  '# 模块市场索引',
  '',
  '这个仓库给 DeepSeek Harness 工作台当模块市场索引：一个包一个文件 `market/<包名>.json`，',
  '产物在 `artifacts/<包名>/`；老仓库的 `market.json` 会在第一次发布时自动拆开。',
  '',
  '## 发布模块',
  '',
  '在模块包里运行：',
  '',
  '```bash',
  'dsh-wb-module release --index <本仓库地址> --index-policy artifacts-in-repo',
  '```',
  '',
  '发布只会改自己包的那一个文件；包与包之间不会碰同一个文件。',
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
export type { MarketEntryFile, MarketIndexAssemble } from './market-index-doc.js';
export {
  compareSemver,
  filterMarketIndex,
  gitUrlOk,
  httpUrlProblem,
  marketEntryLabels,
  marketEntryPath,
  marketSourceKey,
  parseMarketEntryJson,
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

export function assembleMarketIndex(files: readonly MarketEntryFile[]): MarketIndexAssemble {
  const problems: MarketIndexProblem[] = [];
  const entries = new Map<string, MarketIndexEntry>();
  const ordered = [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  for (const file of ordered) {
    if (!file.path.endsWith('.json')) continue;
    const parsed = parseMarketEntryJson(file.text);
    if (!parsed.ok) {
      for (const one of parsed.problems) problems.push({ ...one, at: file.path });
      continue;
    }
    const entry = parsed.entry;
    if (entries.has(entry.name)) {
      problems.push(problem('duplicate-name', `插件名重复：${entry.name}`, file.path));
      continue;
    }
    entries.set(entry.name, { ...entry, versions: sortMarketVersions(entry.versions) });
  }
  if (problems.length > 0) return { ok: false, problems };
  const plugins = [...entries.values()].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return { ok: true, index: { format: MARKET_INDEX_FORMAT, plugins } };
}

export function marketEntryFileOf(entry: MarketIndexEntry, dir: string = MARKET_INDEX_DIR): MarketEntryFile {
  return { path: marketEntryPath(dir, entry.name), text: `${JSON.stringify(entry, null, 2)}\n` };
}

export function marketEntryFilesOf(index: MarketIndex, dir: string = MARKET_INDEX_DIR): readonly MarketEntryFile[] {
  return index.plugins.map((entry) => marketEntryFileOf(healedUnit(entry), dir));
}

function healedUnit(entry: MarketIndexEntry): MarketIndexEntry {
  if (entry.metadata?.unit !== undefined) return entry;
  const unit = entryUnitOf(entry);
  return unit === undefined ? entry : { ...entry, metadata: { ...entry.metadata, unit } };
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
