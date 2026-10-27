import type { DshShell } from '@dsh-workbench/shared';
import { parseJsonLoose } from '@dsh-workbench/shared/host';
import { BROWSER_READ_SESSION } from './browser-read.js';
import { backgroundLine } from '../cli/index.js';
import { runShell } from '@dsh-workbench/shared/host';

const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_SETTLE_MS = 2500;
const URL_TIMEOUT_MS = 8000;
const DEFAULT_LIMIT = 50;
const DEFAULT_TEXT_MAX = 200;

export interface BrowserFindEntry {
  readonly text: string;
  readonly tag: string;
  readonly nth: number;
}

export interface BrowserFindResult {
  readonly ok: boolean;
  readonly code: string;
  readonly at: number;
  readonly entries: readonly BrowserFindEntry[];
  readonly count: number;
  readonly message: string;
  readonly hint?: string;
  readonly detail?: string;
  readonly helpUrl?: string;
}

export interface BrowserFindOptions {
  readonly shell: DshShell;
  readonly css: string;
  readonly url?: string;
  readonly command?: string;
  readonly session?: string;
  readonly limit?: number;
  readonly textMax?: number;
  readonly open?: boolean;
  readonly timeoutMs?: number;
  readonly settleMs?: number;
}

export function cellRowsOf(
  entries: readonly { readonly text?: string }[],
  minCells = 2,
): string[][] {
  const rows: string[][] = [];
  for (const entry of entries) {
    const text = typeof entry?.text === 'string' ? entry.text : '';
    const cells = text
      .split('\n')
      .map((one) => one.trim())
      .filter((one) => one !== '');
    if (cells.length >= minCells) rows.push(cells);
  }
  return rows;
}

export function cellRows(text: string): string[] {
  return text
    .split('\n')
    .map((one) => one.trim())
    .filter((one) => one !== '');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function entriesOf(value: unknown): BrowserFindEntry[] {
  const record = asRecord(value);
  const raw = record === undefined ? undefined : record['entries'];
  if (!Array.isArray(raw)) return [];
  const entries: BrowserFindEntry[] = [];
  for (const one of raw) {
    const item = asRecord(one);
    if (item === undefined) continue;
    const nth = typeof item['nth'] === 'number' ? item['nth'] : entries.length;
    entries.push({ text: textOf(item['text']), tag: textOf(item['tag']), nth });
  }
  return entries;
}

export function reasonOf(stdout: string, stderr: string): string {
  const parsed = asRecord(parseJsonLoose(stdout));
  const error = parsed === undefined ? undefined : asRecord(parsed['error']);
  const message = error === undefined ? '' : textOf(error['message']);
  if (message !== '') return message;
  const source = stderr.trim() === '' ? stdout : stderr;
  const lines = source
    .split('\n')
    .map((one) => one.trim())
    .filter((one) => one !== '');
  return (lines[lines.length - 1] ?? '').slice(-200);
}

function hintOf(stdout: string): string | undefined {
  const parsed = asRecord(parseJsonLoose(stdout));
  const error = parsed === undefined ? undefined : asRecord(parsed['error']);
  const hint = error === undefined ? '' : textOf(error['hint']);
  return hint === '' ? undefined : hint;
}

export function sameOrigin(left: string, right: string): boolean {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

export function urlOf(stdout: string): string {
  const lines = stdout
    .split('\n')
    .map((one) => one.trim())
    .filter((one) => one !== '');
  const first = (lines[0] ?? '').replace(/^url:\s*/i, '').trim();
  const bare = first.replace(/^["']+|["']+$/g, '');
  if (bare.startsWith('{')) {
    const parsed = asRecord(parseJsonLoose(bare));
    const url = parsed === undefined ? '' : textOf(parsed['url']);
    if (url !== '') return url;
  }
  return bare;
}

async function currentUrl(
  shell: DshShell,
  command: string,
  session: string,
): Promise<string> {
  const line = backgroundLine(command, ['browser', session, 'get', 'url', '--window', 'background']);
  try {
    const result = await runShell(shell, line, { timeoutMs: URL_TIMEOUT_MS });
    if (result.exitCode !== 0) return '';
    return urlOf(result.stdout);
  } catch {
    return '';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FindOutcome =
  | { readonly kind: 'ok'; readonly entries: readonly BrowserFindEntry[]; readonly stdout: string }
  | { readonly kind: 'timeout'; readonly detail: string }
  | { readonly kind: 'failed'; readonly detail: string; readonly hint?: string };

async function findOnce(
  shell: DshShell,
  command: string,
  session: string,
  css: string,
  limit: number,
  textMax: number,
  timeoutMs: number,
): Promise<FindOutcome | undefined> {
  const line = backgroundLine(command, [
    'browser',
    session,
    'find',
    '--css',
    css,
    '--limit',
    String(limit),
    '--text-max',
    String(textMax),
    '--window',
    'background',
  ]);
  const result = await runShell(shell, line, { timeoutMs });
  if (result.timedOut) {
    return { kind: 'timeout', detail: `没在 ${Math.round(timeoutMs / 1000)} 秒内返回` };
  }
  if (result.exitCode !== 0) {
    return {
      kind: 'failed',
      detail: reasonOf(result.stdout, result.stderr),
      ...(hintOf(result.stdout) === undefined ? {} : { hint: hintOf(result.stdout) }),
    };
  }
  const entries = entriesOf(parseJsonLoose(result.stdout));
  return { kind: 'ok', entries, stdout: result.stdout };
}

async function openOnce(
  shell: DshShell,
  command: string,
  session: string,
  url: string,
  timeoutMs: number,
): Promise<string | undefined> {
  const line = backgroundLine(command, ['browser', session, 'open', url, '--window', 'background']);
  let result: Awaited<ReturnType<typeof runShell>>;
  try {
    result = await runShell(shell, line, { timeoutMs });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  if (result.timedOut) return `没在 ${Math.round(timeoutMs / 1000)} 秒内打开`;
  if (result.exitCode !== 0) {
    const reason = reasonOf(result.stdout, result.stderr);
    return reason === '' ? `opencli 打开失败（退出码 ${String(result.exitCode ?? '?')}）` : reason;
  }
  return undefined;
}

export async function browserFind(options: BrowserFindOptions): Promise<BrowserFindResult> {
  const { shell, css, url, open = true } = options;
  const command = options.command ?? 'opencli';
  const session = options.session ?? BROWSER_READ_SESSION;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const textMax = options.textMax ?? DEFAULT_TEXT_MAX;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const at = Date.now();

  const find = async (): Promise<FindOutcome | undefined> => {
    try {
      return await findOnce(shell, command, session, css, limit, textMax, timeoutMs);
    } catch (error) {
      return {
        kind: 'failed',
        detail: error instanceof Error ? error.message : String(error),
        hint: '确认后台服务能跑起来，再重试',
      };
    }
  };

  const canMove = open && url !== undefined;

  if (canMove) {
    const here = await currentUrl(shell, command, session);
    if (here !== '' && !sameOrigin(here, url)) {
      const opened = await openOnce(shell, command, session, url, timeoutMs);
      if (opened !== undefined) {
        return {
          ok: false,
          code: 'cli-exec-failed',
          at,
          entries: [],
          count: 0,
          message: '打不开那个页面',
          hint: '在浏览器里手动打开一次，然后重试',
          detail: opened,
          helpUrl: url,
        };
      }
      await sleep(settleMs);
    }
  }

  let outcome = await find();
  if (outcome === undefined) {
    return { ok: false, code: 'cli-exec-failed', at, entries: [], count: 0, message: '没找到元素' };
  }

  if (outcome.kind === 'failed' && canMove) {
    const opened = await openOnce(shell, command, session, url, timeoutMs);
    if (opened === undefined) {
      await sleep(settleMs);
      const second = await find();
      if (second !== undefined) outcome = second;
    }
  }

  if (outcome.kind === 'timeout') {
    return {
      ok: false,
      code: 'cli-timeout',
      at,
      entries: [],
      count: 0,
      message: '这次没找到元素（等超时了）',
      hint: '稍后重试',
      detail: outcome.detail,
      ...(url === undefined ? {} : { helpUrl: url }),
    };
  }

  if (outcome.kind === 'failed') {
    const detail = outcome.detail;
    return {
      ok: false,
      code: 'cli-exec-failed',
      at,
      entries: [],
      count: 0,
      message: detail === '' ? '没找到元素（opencli 命令失败）' : `没找到元素：${detail}`,
      ...(outcome.hint === undefined ? {} : { hint: outcome.hint }),
      ...(detail === '' ? {} : { detail }),
      ...(url === undefined ? {} : { helpUrl: url }),
    };
  }

  return {
    ok: true,
    code: 'ok',
    at,
    entries: outcome.entries,
    count: outcome.entries.length,
    message: outcome.entries.length === 0 ? '页面上没有匹配的元素' : `找到 ${String(outcome.entries.length)} 个元素`,
  };
}
