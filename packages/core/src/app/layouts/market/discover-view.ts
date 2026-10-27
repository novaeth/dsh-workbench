import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import 'dayjs/locale/zh-cn';
import { marketText } from '@dsh-workbench/shared';
import type {
  DiscoverEntry,
  DiscoverSourceRow,
  DiscoverVersionRow,
  MarketSourceConfig,
} from '@/kernel/contract/market-index';

dayjs.extend(localizedFormat);

export type DiscoverSort = 'default' | 'published';

export const DISCOVER_PAGE_SIZE = 50;

export interface DiscoverFilterState {
  readonly query: string;
  readonly category: string | null;
  readonly labels: readonly string[];
}

export interface VersionFlags {
  readonly recommended: boolean;
  readonly prerelease: boolean;
  readonly installed: boolean;
  readonly incompatible: boolean;
  readonly unknown: boolean;
}

export interface SourceFact {
  readonly kind: 'package' | 'registry' | 'repository' | 'commit' | 'directory';
  readonly value: string;
}

export function displayTitleOf(entry: DiscoverEntry, locale: string): string {
  return marketText(entry.title, locale) || entry.name;
}

export function latestVersionOf(entry: DiscoverEntry): DiscoverVersionRow | undefined {
  return entry.versions[0];
}

function haystackOf(entry: DiscoverEntry, locale: string): string {
  return [
    entry.name,
    marketText(entry.title, locale),
    marketText(entry.description, locale),
    entry.author ?? '',
    ...entry.labels,
  ]
    .join(' ')
    .toLowerCase();
}

export function filterEntries(
  entries: readonly DiscoverEntry[],
  state: DiscoverFilterState,
  locale: string,
): readonly DiscoverEntry[] {
  const text = state.query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (state.category !== null && entry.category !== state.category) return false;
    if (!state.labels.every((label) => entry.labels.includes(label))) return false;
    return text === '' || haystackOf(entry, locale).includes(text);
  });
}

export function unfiltered(state: DiscoverFilterState): boolean {
  return state.query.trim() === '' && state.category === null && state.labels.length === 0;
}

function publishedAtOf(entry: DiscoverEntry): number {
  return latestVersionOf(entry)?.publishTimestamp ?? 0;
}

export function sortEntries(
  entries: readonly DiscoverEntry[],
  sort: DiscoverSort,
): readonly DiscoverEntry[] {
  if (sort === 'default') return entries;
  return [...entries].sort((left, right) => publishedAtOf(right) - publishedAtOf(left));
}

export function visibleEntries(entries: readonly DiscoverEntry[], limit: number): readonly DiscoverEntry[] {
  return limit >= entries.length ? entries : entries.slice(0, limit);
}

export function versionFlagsOf(version: DiscoverVersionRow, latest: DiscoverVersionRow | undefined): VersionFlags {
  return {
    recommended: latest !== undefined && latest.version === version.version,
    prerelease: version.version.split('+')[0]?.includes('-') === true,
    installed: version.install === 'installed',
    incompatible: version.compat === 'incompatible',
    unknown: version.compat === 'unknown',
  };
}

export function sourceFactsOf(name: string, version: DiscoverVersionRow): readonly SourceFact[] {
  if (version.source.type === 'npm') {
    return [
      { kind: 'package', value: name },
      ...(version.source.registry === undefined ? [] : [{ kind: 'registry' as const, value: version.source.registry }]),
    ];
  }
  return [
    { kind: 'repository', value: version.source.url },
    { kind: 'commit', value: version.source.commit },
    ...(version.source.path === undefined || version.source.path === ''
      ? []
      : [{ kind: 'directory' as const, value: version.source.path }]),
  ];
}

function dateLocale(locale: string): string {
  return locale.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';
}

export function publishDateText(timestamp: number | undefined, locale: string, style: 'medium' | 'long' = 'medium'): string {
  if (timestamp === undefined) return '';
  return dayjs(timestamp * 1000)
    .locale(dateLocale(locale))
    .format(style === 'long' ? 'LL' : 'll');
}

export type SourceFromUrl = { readonly ok: true; readonly source: MarketSourceConfig } | { readonly ok: false };

const GIT_SSH = /^git@[\w.-]+:/;
const GIT_SCHEME = /^(?:ssh|git|git\+ssh):\/\/(?:[\w.-]+@)?[\w.-]+\//;
const HTTP = /^https?:\/\//;
const REPO_FILE = /\.git(?:\/.*)?$/;
const SCHEME = /^([a-z][a-z0-9+.-]*):\/\//i;
const USER_INFO = /^[a-z][a-z0-9+.-]*:\/\/([^/@]*)@/i;

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function hasCredentials(url: string): boolean {
  const scheme = SCHEME.exec(url)?.[1]?.toLowerCase() ?? '';
  const user = USER_INFO.exec(url)?.[1] ?? '';
  if (user === '') return false;
  if (user.includes(':')) return true;
  return scheme === 'http' || scheme === 'https';
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function sourceFromUrl(raw: string): SourceFromUrl {
  const url = raw.trim();
  if (url === '' || url.includes('#') || hasCredentials(url)) return { ok: false };
  if (HTTP.test(url)) {
    const asGit = REPO_FILE.test(url);
    const label = asGit ? sourceSuffix(url) || hostOf(url) : hostOf(url);
    if (label === '') return { ok: false };
    return {
      ok: true,
      source: {
        id: '',
        label,
        kind: asGit ? 'git' : 'http',
        url: withoutTrailingSlash(url),
      },
    };
  }
  if (GIT_SSH.test(url) || GIT_SCHEME.test(url)) {
    const tail = withoutTrailingSlash(url).split(/[/:]/).filter((part) => part !== '').pop();
    const label = (tail ?? '').replace(/\.git$/, '');
    if (label === '') return { ok: false };
    return { ok: true, source: { id: '', label, kind: 'git', url: withoutTrailingSlash(url) } };
  }
  return { ok: false };
}

export function sameSourceUrl(left: string, right: string): boolean {
  return withoutTrailingSlash(left.trim()) === withoutTrailingSlash(right.trim());
}

function sourceSuffix(url: string): string {
  const tail = withoutTrailingSlash(url).split(/[/:]/).filter((part) => part !== '').pop() ?? '';
  return tail.replace(/\.git$/, '');
}

function sourceTransport(url: string): string {
  if (GIT_SSH.test(url) || /^ssh:\/\//i.test(url) || /^git\+ssh:\/\//i.test(url)) return 'ssh';
  if (/^git:\/\//i.test(url)) return 'git';
  if (/^https:\/\//i.test(url)) return 'https';
  if (/^http:\/\//i.test(url)) return 'http';
  return '';
}

export function sourceLabelsOf(sources: readonly DiscoverSourceRow[]): ReadonlyMap<string, string> {
  const counts = new Map<string, number>();
  for (const source of sources) counts.set(source.label, (counts.get(source.label) ?? 0) + 1);
  const labels = new Map<string, string>();
  for (const source of sources) {
    if ((counts.get(source.label) ?? 0) <= 1) {
      labels.set(source.id, source.label);
      continue;
    }
    const suffix = sourceSuffix(source.url);
    const detail = suffix !== '' && suffix !== source.label ? suffix : sourceTransport(source.url);
    labels.set(source.id, detail === '' ? source.url : `${detail} · ${source.label}`);
  }
  return labels;
}
