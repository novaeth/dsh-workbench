import { createHash } from 'node:crypto';
import type {
  DiscoverFilter,
  IndexSourceSpec,
  MarketIndex,
  MarketIndexEntry,
  MarketIndexParse,
  MarketIndexProblem,
  MarketIndexSource,
  MarketIndexVersion,
  MarketLocalizedText,
  MarketSourceConfig,
} from '../contract/protocol/market-index.js';
import { MARKET_INDEX_DIR, MARKET_INDEX_FORMAT } from '../contract/protocol/market-index.js';
import { marketText } from '../lib/market-index.js';
import type { MarketDocFields, MarketEntryDocParse } from './market-index-doc.js';
import { compareVersions, isValidVersion } from './version.js';

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;
const MAX_ICON_CHARS = 32 * 1024;


export function compareSemver(left: string, right: string): number | undefined {
  return compareVersions(left, right);
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
    const epoch = record['epoch'];
    if (epoch !== undefined && (!Number.isInteger(epoch) || (epoch as number) < 0)) {
      return { ok: false, problems: [problem('timestamp', 'epoch 必须是非负整数', 'entry')] };
    }
    return {
      ok: true,
      doc: { ...fields, publishTimestamp: timestamp as number, ...(epoch === undefined ? {} : { epoch: epoch as number }) },
    };
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

export function marketMetaPath(dir: string, name: string, epoch: number, suffix: string): string {
  if (!NPM_NAME.test(name)) throw new Error(`不是合法包名：${JSON.stringify(name)}`);
  if (!Number.isInteger(epoch) || epoch < 0) throw new Error(`epoch 不合法：${String(epoch)}`);
  if (!/^[a-z0-9]{4,16}$/u.test(suffix)) throw new Error(`后缀不合法：${suffix}`);
  return `${indexPathBase(dir)}/${name}/meta-${String(epoch)}-${suffix}.json`;
}
