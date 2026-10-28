import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type {
  DiscoverFilter,
  IndexSourceSpec,
  MarketIndex,
  MarketIndexEngines,
  MarketIndexEntry,
  MarketIndexEntryMetadata,
  MarketIndexParse,
  MarketIndexProblem,
  MarketIndexSource,
  MarketIndexVersion,
  MarketLocalizedText,
  MarketSourceConfig,
} from '../contract/protocol/market-index.js';
import { MARKET_INDEX_DIR, MARKET_INDEX_FORMAT } from '../contract/protocol/market-index.js';
import { marketText } from '../lib/market-index.js';
import { compareVersions, isValidVersion } from './version.js';

export { marketBranchOk, marketInstallTarget, marketText } from '../lib/market-index.js';

export const MARKET_ENTRIES_README_LINES: readonly string[] = [
  '# 索引目录',
  '',
  '一个包一个目录，一个版本一个文件：`market/<包名>/<版本>.json`。发布只新增文件，不改已有条目。',
  '',
  '`meta-<时间戳>.json` 是只改标题 / 说明时追加的元数据快照，读取时取最新的一份。',
];

export const MARKET_INDEX_README_LINES: readonly string[] = [
  '# 模块市场索引',
  '',
  '这个仓库给 DeepSeek Harness 工作台当模块市场索引：条目在 `market/<包名>/<版本>.json`，一个版本一个文件。',
  '',
  '## 发布模块',
  '',
  '在模块包里运行：',
  '',
  '```bash',
  'dsh-wb-module release --index <本仓库地址> --index-policy artifacts-in-repo',
  '```',
  '',
  '产物会提交到 `packages/<包名>/`（带 scope 时是 `packages/@scope/名字/`），条目提交到 `market/<包名>/<版本>.json`。',
  '发布只新增文件、不改已有条目，两台机器同时发也不会冲突。',
  '',
  '一个包名归第一次发布的人（条目文件里的 `owner`）。换一个署名发同名会被拒；要换人，先把这一条的 `owner` 改成新的人。',
  '同一个市场里，一个模块 id（`metadata.unit`）只能被一个条目使用；另一个包名想用同一个 id / 产物目录也会被拒。',
  '',
  '## 使用这个索引',
  '',
  '在工作台的「模块市场 → 发现」里添加本仓库地址，即可浏览与安装。',
  '',
];

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;
const MAX_ICON_CHARS = 32 * 1024;

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asTextArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === 'string' && item.trim() !== '' ? [item.trim()] : []))
    : [];
}

function asLocalized(value: unknown): MarketLocalizedText | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const zh = asText(record['zh']);
  const en = asText(record['en']);
  return zh === '' && en === '' ? undefined : { ...(zh === '' ? {} : { zh }), ...(en === '' ? {} : { en }) };
}

function problem(kind: MarketIndexProblem['kind'], detail: string, at?: string): MarketIndexProblem {
  return { kind, detail, ...(at === undefined ? {} : { at }) };
}

export function compareSemver(left: string, right: string): number | undefined {
  return compareVersions(left, right);
}

function sourceOf(raw: unknown, at: string): MarketIndexSource | MarketIndexProblem {
  const record = asRecord(raw);
  if (record === undefined) return problem('source', 'source 必须是一个对象', at);
  if (record['type'] === 'npm') {
    const registry = record['registry'];
    if (registry !== undefined && asText(registry) === '') {
      return problem('source', 'npm source 的 registry 必须是非空字符串', at);
    }
    return { type: 'npm', ...(registry === undefined ? {} : { registry: asText(registry) }) };
  }
  if (record['type'] === 'git') {
    const url = asText(record['url']);
    const commit = asText(record['commit']);
    if (url === '') return problem('source', 'git source 缺 url', at);
    if (!GIT_COMMIT.test(commit)) {
      return problem('git-commit', `git source 的 commit 必须是 40 位小写 SHA（现在是 ${JSON.stringify(commit)}）`, at);
    }
    const path = record['path'];
    return {
      type: 'git',
      url,
      commit,
      ...(path === undefined || asText(path) === '' ? {} : { path: asText(path) }),
    };
  }
  return problem('source', 'source.type 只能是 npm 或 git', at);
}

function versionOf(raw: unknown, at: string): MarketIndexVersion | MarketIndexProblem {
  const record = asRecord(raw);
  if (record === undefined) return problem('version', '版本必须是一个对象', at);
  const version = asText(record['version']);
  if (!isValidVersion(version)) return problem('version', `版本号不是合法 SemVer：${JSON.stringify(version)}`, at);
  const source = sourceOf(record['source'], `${at}.source`);
  if ('kind' in source) return source;
  const timestamp = record['publishTimestamp'];
  if (timestamp !== undefined && (!Number.isInteger(timestamp) || (timestamp as number) < 0)) {
    return problem('timestamp', 'publishTimestamp 必须是 Unix 秒整数', at);
  }
  const engines = asRecord(record['engines']);
  const dsh = engines === undefined ? '' : asText(engines['dsh']);
  return {
    version,
    source,
    ...(timestamp === undefined ? {} : { publishTimestamp: timestamp as number }),
    ...(dsh === '' ? {} : { engines: { dsh } }),
  };
}

function versionsOf(raw: unknown, at: string): readonly MarketIndexVersion[] | MarketIndexProblem {
  if (!Array.isArray(raw) || raw.length === 0) return problem('versions', 'versions 必须是非空数组', at);
  const versions: MarketIndexVersion[] = [];
  const seen = new Set<string>();
  for (const [index, item] of raw.entries()) {
    const parsed = versionOf(item, `${at}[${String(index)}]`);
    if ('kind' in parsed) return parsed;
    if (seen.has(parsed.version)) return problem('versions', `版本重复：${parsed.version}`, at);
    seen.add(parsed.version);
    versions.push(parsed);
  }
  for (let index = 1; index < versions.length; index += 1) {
    const order = compareSemver(versions[index - 1]?.version ?? '', versions[index]?.version ?? '');
    if (order === undefined || order < 0) {
      return problem('version-order', 'versions 必须按 SemVer 降序', at);
    }
  }
  return versions;
}

function iconProblem(icon: string): MarketIndexProblem | undefined {
  if (icon.length > MAX_ICON_CHARS) return problem('icon', 'icon 超过 32 KiB');
  if (icon.startsWith('data:image/')) return icon.includes(';base64,') ? undefined : problem('icon', 'data URL 必须是 base64');
  if (/^https?:\/\//i.test(icon)) return undefined;
  return problem('icon', 'icon 只能是 base64 data URL 或 http(s) URL');
}

const MAX_OWNER_CHARS = 200;
const UNIT_ID = /^[a-z][a-z0-9-]*$/;

function ownerProblem(owner: string): MarketIndexProblem | undefined {
  if (/[\r\n]/u.test(owner)) return problem('owner', 'owner 只能是一行署名');
  if (owner.length > MAX_OWNER_CHARS) return problem('owner', 'owner 超过 200 字');
  return undefined;
}

function metadataOf(raw: unknown): MarketIndexEntry['metadata'] {
  const record = asRecord(raw);
  if (record === undefined) return undefined;
  const workbench = record['workbench'] === true;
  const unit = asText(record['unit']);
  const category = asText(record['category']);
  const labels = asTextArray(record['labels']);
  const keywords = asTextArray(record['keywords']);
  const sortKeysRecord = asRecord(record['sortKeys']);
  const sortKeys =
    sortKeysRecord === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(sortKeysRecord).flatMap(([key, value]) =>
            typeof value === 'string' || typeof value === 'number' ? [[key, value] as const] : [],
          ),
        );
  return {
    ...(workbench ? { workbench: true } : {}),
    ...(unit === '' ? {} : { unit }),
    ...(category === '' ? {} : { category }),
    ...(labels.length === 0 ? {} : { labels }),
    ...(keywords.length === 0 ? {} : { keywords }),
    ...(sortKeys === undefined || Object.keys(sortKeys).length === 0 ? {} : { sortKeys }),
  };
}

function entryOf(raw: unknown, at: string): MarketIndexEntry | MarketIndexProblem {
  const record = asRecord(raw);
  if (record === undefined) return problem('plugin', '插件条目必须是对象', at);
  const name = asText(record['name']);
  if (name === '' || name.length > 214 || !NPM_NAME.test(name)) {
    return problem('name', `不是合法 npm 包名：${JSON.stringify(name)}`, at);
  }
  const versions = versionsOf(record['versions'], `${at}.versions`);
  if ('kind' in versions) return versions;
  const icon = asText(record['icon']);
  if (icon !== '') {
    const badIcon = iconProblem(icon);
    if (badIcon !== undefined) return badIcon;
  }
  const title = asLocalized(record['title']);
  const description = asLocalized(record['description']);
  const author = asText(record['author']);
  const owner = asText(record['owner']);
  if (owner !== '') {
    const badOwner = ownerProblem(owner);
    if (badOwner !== undefined) return badOwner;
  }
  const homepage = asText(record['homepage']);
  const metadata = metadataOf(record['metadata']);
  if (metadata?.unit !== undefined && !UNIT_ID.test(metadata.unit)) {
    return problem('unit', `metadata.unit 只能是小写字母开头的 a-z0-9-（现在是 ${JSON.stringify(metadata.unit)}）`, at);
  }
  return {
    name,
    versions,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(author === '' ? {} : { author }),
    ...(owner === '' ? {} : { owner }),
    ...(homepage === '' ? {} : { homepage }),
    ...(icon === '' ? {} : { icon }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function parseMarketIndex(raw: unknown): MarketIndexParse {
  const record = asRecord(raw);
  if (record === undefined) return { ok: false, problems: [problem('not-object', '索引必须是一个 JSON 对象')] };
  if (record['format'] !== MARKET_INDEX_FORMAT) {
    return {
      ok: false,
      problems: [problem('format', `format 必须是 ${String(MARKET_INDEX_FORMAT)}（现在是 ${JSON.stringify(record['format'])}）`)],
    };
  }
  const plugins = record['plugins'];
  if (!Array.isArray(plugins)) return { ok: false, problems: [problem('plugins', 'plugins 必须是数组')] };
  const entries: MarketIndexEntry[] = [];
  const problems: MarketIndexProblem[] = [];
  const seen = new Set<string>();
  for (const [index, item] of plugins.entries()) {
    const parsed = entryOf(item, `plugins[${String(index)}]`);
    if ('kind' in parsed) {
      problems.push(parsed);
      continue;
    }
    if (seen.has(parsed.name)) {
      problems.push(problem('duplicate-name', `插件名重复：${parsed.name}`, `plugins[${String(index)}]`));
      continue;
    }
    seen.add(parsed.name);
    entries.push(parsed);
  }
  if (problems.length > 0) return { ok: false, problems };
  const title = asLocalized(record['title']);
  const description = asLocalized(record['description']);
  const metadata = asRecord(record['metadata']);
  return {
    ok: true,
    index: {
      format: MARKET_INDEX_FORMAT,
      plugins: entries,
      ...(title === undefined ? {} : { title }),
      ...(description === undefined ? {} : { description }),
      ...(metadata === undefined ? {} : { metadata: metadata as MarketIndex['metadata'] }),
    },
  };
}

export function parseMarketIndexJson(text: string): MarketIndexParse {
  try {
    return parseMarketIndex(JSON.parse(text) as unknown);
  } catch (error) {
    return {
      ok: false,
      problems: [problem('not-json', `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`)],
    };
  }
}

export function sortMarketVersions(versions: readonly MarketIndexVersion[]): MarketIndexVersion[] {
  return [...versions].sort((left, right) => (compareSemver(right.version, left.version) ?? 0));
}

export function upsertMarketEntry(index: MarketIndex, entry: MarketIndexEntry): MarketIndex {
  const found = index.plugins.findIndex((item) => item.name === entry.name);
  if (found === -1) return { ...index, plugins: [...index.plugins, entry] };
  const current = index.plugins[found];
  if (current === undefined) return { ...index, plugins: [...index.plugins, entry] };
  const merged = new Map<string, MarketIndexVersion>();
  for (const one of current.versions) merged.set(one.version, one);
  for (const one of entry.versions) merged.set(one.version, one);
  const owner = current.owner ?? entry.owner;
  const plugins = [...index.plugins];
  plugins[found] = {
    ...current,
    ...entry,
    ...(owner === undefined ? {} : { owner }),
    versions: sortMarketVersions([...merged.values()]),
  };
  return { ...index, plugins };
}

export function marketEntryLabels(entry: MarketIndexEntry): readonly string[] {
  return entry.metadata?.labels ?? [];
}

export function filterMarketIndex(index: MarketIndex, filter: DiscoverFilter): readonly MarketIndexEntry[] {
  const query = (filter.query ?? '').trim().toLowerCase();
  const category = (filter.category ?? '').trim();
  const label = (filter.label ?? '').trim();
  return index.plugins.filter((entry) => {
    if (category !== '' && entry.metadata?.category !== category) return false;
    if (label !== '' && !marketEntryLabels(entry).includes(label)) return false;
    if (query === '') return true;
    const haystack = [
      entry.name,
      marketText(entry.title, 'zh'),
      marketText(entry.title, 'en'),
      marketText(entry.description, 'zh'),
      marketText(entry.description, 'en'),
      entry.author ?? '',
      ...(entry.metadata?.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function marketSourceKey(source: IndexSourceSpec): string {
  const canonical = JSON.stringify([source.kind, source.url.trim(), source.ref ?? '', source.path ?? '']);
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export type SourceConfigParse =
  | { readonly ok: true; readonly source: MarketSourceConfig }
  | { readonly ok: false; readonly problem: MarketIndexProblem };

export function parseSourceConfig(raw: unknown): SourceConfigParse {
  const record = asRecord(raw);
  if (record === undefined) return { ok: false, problem: problem('source', '索引源必须是对象') };
  const id = asText(record['id']);
  const label = asText(record['label']);
  const kind = record['kind'];
  const url = asText(record['url']);
  if (id === '') return { ok: false, problem: problem('source', '索引源缺 id') };
  if (label === '') return { ok: false, problem: problem('source', '索引源缺 label') };
  if (kind !== 'http' && kind !== 'git') return { ok: false, problem: problem('source', 'kind 只能是 http 或 git') };
  if (kind === 'http') {
    const bad = httpUrlProblem(url);
    if (bad !== undefined) return { ok: false, problem: problem('source', bad) };
    return { ok: true, source: { id, label, kind, url } };
  }
  if (!gitUrlOk(url)) {
    return { ok: false, problem: problem('source', 'git 地址不合格（只收 https / ssh / scp 形式，且不能带凭据）') };
  }
  const ref = asText(record['ref']);
  const path = asText(record['path']);
  const localPath = asText(record['localPath']);
  const policy = record['policy'];
  if (policy !== undefined && policy !== 'artifacts-in-repo' && policy !== 'catalog-only') {
    return { ok: false, problem: problem('source', 'policy 只能是 artifacts-in-repo 或 catalog-only') };
  }
  return {
    ok: true,
    source: {
      id,
      label,
      kind,
      url,
      ...(ref === '' ? {} : { ref }),
      ...(path === '' ? {} : { path }),
      ...(localPath === '' ? {} : { localPath }),
      ...(policy === undefined ? {} : { policy: policy as MarketSourceConfig['policy'] }),
    },
  };
}

export function httpUrlProblem(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '不是合法 URL';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '只收 http / https';
  if (parsed.username !== '' || parsed.password !== '') return 'URL 不能带凭据';
  if (parsed.search !== '' || parsed.hash !== '') return 'URL 不能带 query / fragment';
  return undefined;
}

export function gitUrlOk(url: string): boolean {
  if (url === '') return false;
  if (/^[^@\s]+@[^@\s:]+:[^@\s]+$/.test(url)) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'ssh:' && parsed.protocol !== 'http:') return false;
  if (parsed.password !== '') return false;
  if (parsed.username !== '' && parsed.protocol !== 'ssh:') return false;
  if (parsed.search !== '' || parsed.hash !== '') return false;
  return true;
}

export interface MarketVersionDoc {
  readonly name: string;
  readonly version: string;
  readonly source: MarketIndexSource;
  readonly publishTimestamp?: number;
  readonly engines?: MarketIndexEngines;
  readonly title?: MarketLocalizedText;
  readonly description?: MarketLocalizedText;
  readonly author?: string;
  readonly owner?: string;
  readonly homepage?: string;
  readonly icon?: string;
  readonly metadata?: MarketIndexEntryMetadata;
}

export interface MarketMetaDoc {
  readonly name: string;
  readonly publishTimestamp: number;
  readonly title?: MarketLocalizedText;
  readonly description?: MarketLocalizedText;
  readonly author?: string;
  readonly owner?: string;
  readonly homepage?: string;
  readonly icon?: string;
  readonly metadata?: MarketIndexEntryMetadata;
}

export type MarketEntryDoc = MarketVersionDoc | MarketMetaDoc;

export type MarketEntryDocParse =
  | { readonly ok: true; readonly doc: MarketEntryDoc }
  | { readonly ok: false; readonly problems: readonly MarketIndexProblem[] };

export interface MarketEntryFile {
  readonly path: string;
  readonly text: string;
}

export type MarketIndexAssemble =
  | { readonly ok: true; readonly index: MarketIndex }
  | { readonly ok: false; readonly problems: readonly MarketIndexProblem[] };

interface MarketDocFields {
  readonly name: string;
  readonly title?: MarketLocalizedText;
  readonly description?: MarketLocalizedText;
  readonly author?: string;
  readonly owner?: string;
  readonly homepage?: string;
  readonly icon?: string;
  readonly metadata?: MarketIndexEntryMetadata;
}

function docFieldsOf(record: Readonly<Record<string, unknown>>, at: string): MarketDocFields | MarketIndexProblem {
  const name = asText(record['name']);
  if (name === '' || name.length > 214 || !NPM_NAME.test(name)) {
    return problem('name', `不是合法 npm 包名：${JSON.stringify(name)}`, at);
  }
  const icon = asText(record['icon']);
  if (icon !== '') {
    const badIcon = iconProblem(icon);
    if (badIcon !== undefined) return badIcon;
  }
  const owner = asText(record['owner']);
  if (owner !== '') {
    const badOwner = ownerProblem(owner);
    if (badOwner !== undefined) return badOwner;
  }
  const metadata = metadataOf(record['metadata']);
  if (metadata?.unit !== undefined && !UNIT_ID.test(metadata.unit)) {
    return problem('unit', `metadata.unit 只能是小写字母开头的 a-z0-9-（现在是 ${JSON.stringify(metadata.unit)}）`, at);
  }
  const title = asLocalized(record['title']);
  const description = asLocalized(record['description']);
  const author = asText(record['author']);
  const homepage = asText(record['homepage']);
  return {
    name,
    ...(title === undefined ? {} : { title }),
    ...(description === undefined ? {} : { description }),
    ...(author === '' ? {} : { author }),
    ...(owner === '' ? {} : { owner }),
    ...(homepage === '' ? {} : { homepage }),
    ...(icon === '' ? {} : { icon }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function parseMarketEntryDoc(raw: unknown): MarketEntryDocParse {
  const record = asRecord(raw);
  if (record === undefined) return { ok: false, problems: [problem('entry', '条目文件必须是一个 JSON 对象')] };
  const fields = docFieldsOf(record, 'entry');
  if ('kind' in fields) return { ok: false, problems: [fields] };
  const version = asText(record['version']);
  const timestamp = record['publishTimestamp'];
  if (timestamp !== undefined && (!Number.isInteger(timestamp) || (timestamp as number) < 0)) {
    return { ok: false, problems: [problem('timestamp', 'publishTimestamp 必须是 Unix 秒整数', 'entry')] };
  }
  if (version === '') {
    if (timestamp === undefined) {
      return { ok: false, problems: [problem('timestamp', '元数据文件要有 publishTimestamp', 'entry')] };
    }
    return { ok: true, doc: { ...fields, publishTimestamp: timestamp as number } };
  }
  if (!isValidVersion(version)) {
    return { ok: false, problems: [problem('version', `版本号不是合法 SemVer：${JSON.stringify(version)}`, 'entry')] };
  }
  const source = sourceOf(record['source'], 'entry.source');
  if ('kind' in source) return { ok: false, problems: [source] };
  const engines = asRecord(record['engines']);
  const dsh = engines === undefined ? '' : asText(engines['dsh']);
  return {
    ok: true,
    doc: {
      ...fields,
      version,
      source,
      ...(timestamp === undefined ? {} : { publishTimestamp: timestamp as number }),
      ...(dsh === '' ? {} : { engines: { dsh } }),
    },
  };
}

function indexPathBase(dir: string): string {
  return dir.replace(/^\/+|\/+$/g, '') || MARKET_INDEX_DIR;
}

export function marketEntryPath(dir: string, name: string, version: string): string {
  if (!NPM_NAME.test(name)) throw new Error(`不是合法包名：${JSON.stringify(name)}`);
  if (!isValidVersion(version)) throw new Error(`不是合法版本号：${JSON.stringify(version)}`);
  return `${indexPathBase(dir)}/${name}/${version}.json`;
}

export function marketMetaPath(dir: string, name: string, at: number): string {
  if (!NPM_NAME.test(name)) throw new Error(`不是合法包名：${JSON.stringify(name)}`);
  if (!Number.isInteger(at) || at < 0) throw new Error(`时间戳不合法：${String(at)}`);
  return `${indexPathBase(dir)}/${name}/meta-${String(at)}.json`;
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

export function marketMetaDocOf(entry: MarketIndexEntry, at: number): MarketMetaDoc {
  return { ...docFieldsFromEntry(entry), publishTimestamp: at };
}

export function assembleMarketIndex(files: readonly MarketEntryFile[]): MarketIndexAssemble {
  const problems: MarketIndexProblem[] = [];
  interface Group {
    versions: Map<string, MarketIndexVersion>;
    meta: { at: number; path: string; doc: MarketEntryDoc } | undefined;
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
    const group = groups.get(doc.name) ?? { versions: new Map<string, MarketIndexVersion>(), meta: undefined };
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
    }
    const newer = group.meta === undefined || at > group.meta.at || (at === group.meta.at && file.path > group.meta.path);
    if (newer) group.meta = { at, path: file.path, doc };
    groups.set(doc.name, group);
  }
  if (problems.length > 0) return { ok: false, problems };
  const plugins: MarketIndexEntry[] = [...groups.entries()].map(([name, group]) => {
    const meta = group.meta?.doc;
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
        text: `${JSON.stringify(marketVersionDocOf(entry, version), null, 2)}\n`,
      });
    }
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
