import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DshShell } from '@dsh-workbench/shared';
import type {
  MarketPublishDestination,
  MarketSourceConfig,
  PublishChangelog,
  PublishPreview,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import { MARKET_INDEX_PATH } from '@dsh-workbench/shared/contract/protocol/market-index';
import {
  CHANGELOG_FILE,
  changelogHasEntry,
  changelogSectionOf,
  marketSourceKey,
  parseMarketIndexJson,
  parseSourceConfig,
  quoteShellArg,
  runShell,
  workbenchRoot,
} from '@dsh-workbench/shared/host';
import { modulesIn } from './diy-modules';

const ARTIFACTS = ['dist', 'client.js', 'cordis.patch.yml', 'README.md', 'CHANGELOG.md', 'package.json'];
const SEMVER = /^(\d+)\.(\d+)\.(\d+)/;

function selectedGitSource(): MarketSourceConfig | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(workbenchRoot(), 'market-index', 'sources.json'), 'utf8'));
  } catch {
    return undefined;
  }
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const selected = typeof record['selected'] === 'string' ? record['selected'] : '';
  const list = Array.isArray(record['sources']) ? record['sources'] : [];
  for (const item of list) {
    const parsed = parseSourceConfig(item);
    if (!parsed.ok || parsed.source.id !== selected || parsed.source.kind !== 'git') continue;
    return parsed.source.policy === 'artifacts-in-repo' ? parsed.source : undefined;
  }
  return undefined;
}

interface PublishedEntry {
  readonly versions: readonly string[];
  readonly author: string;
}

function publishedEntryOf(source: MarketSourceConfig, name: string): PublishedEntry | undefined {
  const file = join(
    workbenchRoot(),
    'market-index',
    marketSourceKey(source),
    'worktree',
    source.path ?? MARKET_INDEX_PATH,
  );
  if (!existsSync(file)) return undefined;
  try {
    const parsed = parseMarketIndexJson(readFileSync(file, 'utf8'));
    if (!parsed.ok) return undefined;
    const entry = parsed.index.plugins.find((one) => one.name === name);
    if (entry === undefined) return { versions: [], author: '' };
    return {
      versions: entry.versions.map((one) => one.version),
      author: typeof entry.author === 'string' ? entry.author.trim() : '',
    };
  } catch {
    return undefined;
  }
}

function publishedVersionsOf(source: MarketSourceConfig, name: string): readonly string[] | undefined {
  return publishedEntryOf(source, name)?.versions;
}

function bumped(version: string, kind: string): string {
  const match = SEMVER.exec(version);
  if (match === null) return version;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function nextVersionOf(version: string, published: readonly string[] | undefined): string | undefined {
  if (published === undefined) return undefined;
  const exists = (one: string): boolean => published.includes(one);
  if (!exists(version)) return version;
  for (const kind of ['patch', 'minor', 'major'] as const) {
    const candidate = bumped(version, kind);
    if (!exists(candidate)) return candidate;
  }
  return undefined;
}

function marketOf(unit: string, dir: string, name: string, version: string): MarketPublishDestination | undefined {
  const source = selectedGitSource();
  if (source === undefined) return undefined;
  const nextVersion = nextVersionOf(version, publishedVersionsOf(source, name));
  return {
    url: source.url,
    ...(source.ref === undefined ? {} : { ref: source.ref }),
    indexPath: source.path ?? MARKET_INDEX_PATH,
    artifactPath: `packages/${unit}`,
    files: ARTIFACTS.filter((one) => existsSync(join(dir, one))),
    ...(nextVersion === undefined ? {} : { nextVersion }),
  };
}

export interface PublishModuleFact {
  readonly dir: string;
  readonly name: string;
  readonly author: string;
}

export function moduleFactOf(root: string | null | undefined, unit: string): PublishModuleFact | null {
  if (root === null || root === undefined || unit === '') return null;
  const found = modulesIn(root).find((one) => one.unit === unit);
  if (found === undefined) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(found.dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  if (typeof manifest !== 'object' || manifest === null) return null;
  const record = manifest as Record<string, unknown>;
  return {
    dir: found.dir,
    name: typeof record['name'] === 'string' ? record['name'].trim() : '',
    author: authorOf(record),
  };
}

function siblingAuthorOf(root: string, unit: string): string | undefined {
  const authors = new Set<string>();
  for (const module of modulesIn(root)) {
    if (module.unit === unit) continue;
    try {
      const manifest: unknown = JSON.parse(readFileSync(join(module.dir, 'package.json'), 'utf8'));
      if (typeof manifest !== 'object' || manifest === null) continue;
      const author = authorOf(manifest as Record<string, unknown>);
      if (author !== '') authors.add(author);
    } catch {
      continue;
    }
  }
  return authors.size === 1 ? [...authors][0] : undefined;
}

export async function localGitIdentityOf(
  shell: DshShell | undefined,
  dir: string,
): Promise<string | undefined> {
  if (shell === undefined) return undefined;
  const read = async (argv: string): Promise<string> => {
    const result = await runShell(shell, `git -C ${quoteShellArg(dir)} ${argv}`, { workdir: dir });
    return result.exitCode === 0 ? result.stdout.trim() : '';
  };
  const name = await read(`config ${quoteShellArg('user.name')}`);
  if (name === '') return undefined;
  const email = await read(`config ${quoteShellArg('user.email')}`);
  return email === '' ? name : `${name} <${email}>`;
}

export async function lastCommitAuthorOf(
  shell: DshShell | undefined,
  dir: string,
): Promise<string | undefined> {
  if (shell === undefined) return undefined;
  const result = await runShell(shell, `git -C ${quoteShellArg(dir)} log -1 --format=${quoteShellArg('%an <%ae>')}`, {
    workdir: dir,
  });
  const author = result.exitCode === 0 ? result.stdout.trim() : '';
  return author === '' ? undefined : author;
}

export async function inferredAuthorOf(
  root: string | null | undefined,
  unit: string,
  shell: DshShell | undefined,
): Promise<string | undefined> {
  const fact = moduleFactOf(root, unit);
  if (fact === null) return undefined;
  if (fact.author !== '') return fact.author;
  const source = selectedGitSource();
  if (source !== undefined && fact.name !== '') {
    const published = publishedEntryOf(source, fact.name)?.author ?? '';
    if (published !== '') return published;
  }
  const sibling = root === null || root === undefined ? undefined : siblingAuthorOf(root, unit);
  if (sibling !== undefined) return sibling;
  const local = await localGitIdentityOf(shell, fact.dir);
  if (local !== undefined) return local;
  return lastCommitAuthorOf(shell, fact.dir);
}

export function publishPreviewOf(
  root: string | null | undefined,
  unit: string,
  options: { readonly version?: string | undefined; readonly author?: string | undefined } = {},
): PublishPreview | null {
  if (root === null || root === undefined || unit === '') return null;
  const found = modulesIn(root).find((one) => one.unit === unit);
  if (found === undefined) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(found.dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  if (typeof manifest !== 'object' || manifest === null) return null;
  const record = manifest as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'] : '';
  const version = typeof record['version'] === 'string' ? record['version'] : '';
  if (name === '' || version === '') return null;
  const publishConfig = record['publishConfig'];
  const registry =
    typeof publishConfig === 'object' && publishConfig !== null
      ? (publishConfig as Record<string, unknown>)['registry']
      : undefined;
  const market = marketOf(found.unit, found.dir, name, version);
  const target = targetVersionOf(version, (options.version ?? '').trim(), market);
  const askedAuthor = (options.author ?? '').trim();
  const author = askedAuthor === '' ? authorOf(record) : askedAuthor;
  return {
    name,
    version,
    ...(author === '' ? {} : { author }),
    ...(typeof registry === 'string' && registry !== '' ? { registry } : {}),
    ...(market === undefined ? {} : { market }),
    changelog: changelogOf(found.dir, target),
  };
}

function authorOf(manifest: Record<string, unknown>): string {
  const author = manifest['author'];
  if (typeof author === 'string') return author.trim();
  if (author === null || typeof author !== 'object') return '';
  const record = author as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'].trim() : '';
  if (name === '') return '';
  const email = typeof record['email'] === 'string' ? record['email'].trim() : '';
  return email === '' ? name : `${name} <${email}>`;
}

function targetVersionOf(
  version: string,
  asked: string,
  market: MarketPublishDestination | undefined,
): string {
  if (asked === '') return market?.nextVersion ?? version;
  if (/^(major|minor|patch)$/.test(asked)) return bumped(version, asked) ?? version;
  return asked;
}

function changelogOf(dir: string, version: string): PublishChangelog {
  let text: string | undefined;
  try {
    text = readFileSync(join(dir, CHANGELOG_FILE), 'utf8');
  } catch {
    text = undefined;
  }
  if (text === undefined || !changelogHasEntry(text, version)) return { version, missing: true };
  return { version, text: changelogSectionOf(text, version) ?? '' };
}
