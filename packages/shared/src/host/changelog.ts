import dayjs from 'dayjs';

export const CHANGELOG_FILE = 'CHANGELOG.md';

export const CHANGELOG_KINDS = ['added', 'changed', 'fixed', 'removed', 'security', 'deprecated'] as const;

export type ChangelogKind = (typeof CHANGELOG_KINDS)[number];

export interface ChangelogSection {
  readonly version: string;
  readonly body: string;
}

export interface ChangelogEntryOptions {
  readonly version: string;
  readonly kind?: ChangelogKind | undefined;
  readonly note: string;
  readonly date?: string | undefined;
}

const KIND_LABELS: Readonly<Record<ChangelogKind, string>> = {
  added: '✨ 新增',
  changed: '⚡ 改进',
  fixed: '🐛 修复',
  removed: '🗑️ 移除',
  security: '🔒 安全',
  deprecated: '⚠️ 弃用',
};

const VERSION_HEADING = /^##[ \t]+\[?v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\]?[ \t]*(?:-[ \t]*.*)?$/;
const ANY_SECTION = /^##[ \t]/;
const SUBSECTION = /^###[ \t]/;

export function changelogVersion(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/^v/, '');
}

export function changelogDate(now: Date = new Date()): string {
  return dayjs(now).format('YYYY-MM-DD');
}

export function normalizeChangelogText(text: string): string {
  return String(text ?? '').replace(/\r\n?/g, '\n');
}

function linesOf(text: string): string[] {
  return normalizeChangelogText(text).split('\n');
}

function bodyOf(rows: readonly string[]): string {
  return rows.join('\n').trim();
}

function sectionRange(
  rows: readonly string[],
  version: string,
): { readonly start: number; readonly end: number } | undefined {
  const wanted = changelogVersion(version);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? '';
    if (!ANY_SECTION.test(row)) continue;
    const match = VERSION_HEADING.exec(row);
    if (match === null || changelogVersion(match[1] ?? '') !== wanted) continue;
    let end = rows.length;
    for (let next = index + 1; next < rows.length; next += 1) {
      if (ANY_SECTION.test(rows[next] ?? '')) {
        end = next;
        break;
      }
    }
    return { start: index, end };
  }
  return undefined;
}

export function changelogSkeleton(): string {
  return '# 更新日志\n';
}

export function parseChangelog(text: string): readonly ChangelogSection[] {
  const rows = linesOf(text);
  const sections: ChangelogSection[] = [];
  let current: { readonly version: string; readonly from: number } | undefined;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? '';
    if (!ANY_SECTION.test(row)) continue;
    if (current !== undefined) {
      sections.push({ version: current.version, body: bodyOf(rows.slice(current.from, index)) });
    }
    const match = VERSION_HEADING.exec(row);
    current =
      match === null
        ? undefined
        : { version: changelogVersion(match[1] ?? ''), from: index + 1 };
  }
  if (current !== undefined) {
    sections.push({ version: current.version, body: bodyOf(rows.slice(current.from)) });
  }
  return sections;
}

export function changelogSectionOf(text: string, version: string): string | undefined {
  const wanted = changelogVersion(version);
  return parseChangelog(text).find((one) => one.version === wanted)?.body;
}

export function changelogHasEntry(text: string, version: string): boolean {
  const body = changelogSectionOf(text, version);
  if (body === undefined) return false;
  return body
    .split('\n')
    .map((one) => one.trim())
    .some((one) => one !== '' && !one.startsWith('#') && !one.startsWith('<!--') && !/^`[^`]*`$/.test(one));
}

function bulletsOf(note: string): string[] {
  return note
    .split('\n')
    .map((one) => one.trim())
    .filter((one) => one !== '')
    .map((one) => `- ${one}`);
}

function blockOf(options: ChangelogEntryOptions, label: string, bullets: readonly string[]): string[] {
  const date = (options.date ?? '').trim();
  return [
    `## v${changelogVersion(options.version)}`,
    ...(date === '' ? [] : ['', `\`${date}\``]),
    '',
    `### ${label}`,
    '',
    ...bullets,
  ];
}

function insertBlock(rows: readonly string[], at: number, block: readonly string[]): string[] {
  const before = rows.slice(0, at);
  while (before.length > 0 && (before[before.length - 1] ?? '').trim() === '') before.pop();
  const after = rows.slice(at);
  while (after.length > 0 && (after[0] ?? '').trim() === '') after.shift();
  const out = [...before];
  if (out.length > 0) out.push('');
  out.push(...block);
  if (after.length > 0) {
    out.push('');
    out.push(...after);
  }
  return out;
}

function newSectionAt(rows: readonly string[]): number {
  for (let index = 0; index < rows.length; index += 1) {
    if (/^##[ \t]+\[?unreleased\]?[ \t]*$/i.test(rows[index] ?? '')) {
      for (let next = index + 1; next < rows.length; next += 1) {
        if (ANY_SECTION.test(rows[next] ?? '')) return next;
      }
      return rows.length;
    }
  }
  for (let index = 0; index < rows.length; index += 1) {
    if (ANY_SECTION.test(rows[index] ?? '')) return index;
  }
  return rows.length;
}

export function appendChangelogEntry(text: string, options: ChangelogEntryOptions): string {
  const kind: ChangelogKind = options.kind ?? 'changed';
  const label = KIND_LABELS[kind];
  const bullets = bulletsOf(options.note);
  if (bullets.length === 0) return normalizeChangelogText(text);
  const blocks = blockOf(options, label, bullets);
  const source = normalizeChangelogText(text).trim() === '' ? changelogSkeleton() : normalizeChangelogText(text);
  const rows = linesOf(source);
  const range = sectionRange(rows, options.version);
  if (range === undefined) return `${insertBlock(rows, newSectionAt(rows), blocks).join('\n').replace(/\n+$/, '')}\n`;
  let subsection = -1;
  for (let index = range.start + 1; index < range.end; index += 1) {
    const heading = (rows[index] ?? '').trim();
    if (SUBSECTION.test(heading) && heading.includes(label)) {
      subsection = index;
      break;
    }
  }
  if (subsection === -1) {
    const out = [...rows];
    out.splice(range.end, 0, '', `### ${label}`, '', ...bullets);
    return `${normalizeWhitespace(out)}\n`;
  }
  let end = range.end;
  for (let index = subsection + 1; index < range.end; index += 1) {
    if (SUBSECTION.test(rows[index] ?? '')) {
      end = index;
      break;
    }
  }
  const out = [...rows];
  let at = end;
  while (at > subsection + 1 && (out[at - 1] ?? '').trim() === '') at -= 1;
  out.splice(at, 0, ...bullets);
  return `${normalizeWhitespace(out)}\n`;
}

export interface ChangelogPlan {
  readonly action: 'kept' | 'written';
  readonly version: string;
  readonly text: string;
  readonly section: string;
}

export function planChangelog(text: string, options: ChangelogEntryOptions): ChangelogPlan | undefined {
  const source = normalizeChangelogText(text);
  const version = changelogVersion(options.version);
  const section = changelogSectionOf(source, version);
  if (section !== undefined && changelogHasEntry(source, version)) {
    return { action: 'kept', version, text: source, section };
  }
  if (bulletsOf(options.note).length === 0) return undefined;
  const next = appendChangelogEntry(source, options);
  return { action: 'written', version, text: next, section: changelogSectionOf(next, version) ?? '' };
}

function normalizeWhitespace(rows: readonly string[]): string {
  const out: string[] = [];
  for (const row of rows) {
    if (row.trim() === '' && out.length > 0 && (out[out.length - 1] ?? '').trim() === '') continue;
    out.push(row);
  }
  return out.join('\n').replace(/\n+$/, '');
}
