import type { DshShell } from '../api/dsh.js';
import { parseJsonLoose } from '../lib/text.js';
import { tailLines } from './shell-text.js';
import { backgroundLine } from './opencli-window.js';
import { runShell } from './shell.js';

export const BROWSER_SCREEN_SESSION = 'workbench';
export const BROWSER_READ_SESSION = 'workbench-read';
export const BROWSER_RECORD_SESSION = 'workbench-rec';

const DEFAULT_TIMEOUT_MS = 25000;
const DEFAULT_RETRY_MS = 1200;
const DEFAULT_SETTLE_MS = 900;

const AUTH_CODES = new Set([
  'NOT_LOGGED_IN',
  'NOT_LOGIN',
  'AUTH_FAILED',
  'AUTH_REQUIRED',
  'UNAUTHENTICATED',
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
]);

const PERMISSION_CODES = new Set(['FORBIDDEN', 'PERMISSION_DENIED', 'NO_PERMISSION', 'EACCES']);

export interface BrowserReadResult {
  readonly ok: boolean;
  readonly code: string;
  readonly at: number;
  readonly value?: unknown;
  readonly pageCode?: string;
  readonly message: string;
  readonly hint?: string;
  readonly detail?: string;
  readonly helpUrl?: string;
}

export interface BrowserReadOptions {
  readonly shell: DshShell;
  readonly script: string;
  readonly url?: string;
  readonly loginUrl?: string;
  readonly command?: string;
  readonly session?: string;
  readonly open?: boolean;
  readonly timeoutMs?: number;
  readonly retryMs?: number;
  readonly settleMs?: number;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function codeOf(page: unknown): string {
  const record = asRecord(page);
  return record === undefined ? '' : textOf(record['code']);
}

function messageOf(page: unknown): string {
  const record = asRecord(page);
  return record === undefined ? '' : textOf(record['message']);
}

function hintOf(page: unknown): string | undefined {
  const record = asRecord(page);
  const hint = record === undefined ? '' : textOf(record['hint']);
  return hint === '' ? undefined : hint;
}

function pageFailed(page: unknown): boolean {
  const record = asRecord(page);
  return record !== undefined && record['ok'] === false;
}

function blockerFor(code: string): 'auth-required' | 'permission-denied' | undefined {
  const normalized = code.trim().toUpperCase().replace(/-/g, '_');
  if (normalized === '') return undefined;
  const matches = (set: Set<string>): boolean =>
    [...set].some((one) => normalized === one || normalized.endsWith(`_${one}`));
  if (matches(PERMISSION_CODES)) return 'permission-denied';
  if (matches(AUTH_CODES) || normalized.includes('UNAUTH')) return 'auth-required';
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Attempt =
  | { readonly kind: 'value'; readonly value: unknown }
  | { readonly kind: 'failure'; readonly result: Omit<BrowserReadResult, 'at'> };

type ShellOutcome =
  | { readonly kind: 'ok'; readonly stdout: string }
  | { readonly kind: 'timeout'; readonly detail: string; readonly stderr: string }
  | { readonly kind: 'failed'; readonly detail: string; readonly stderr: string };

async function shellRun(
  shell: DshShell,
  command: string,
  argv: readonly string[],
  timeoutMs: number,
): Promise<ShellOutcome> {
  const result = await runShell(shell, backgroundLine(command, argv), { timeoutMs });
  if (result.timedOut) {
    return { kind: 'timeout', detail: `没在 ${Math.round(timeoutMs / 1000)} 秒内返回`, stderr: result.stderr };
  }
  if (result.exitCode !== 0) {
    return { kind: 'failed', detail: tailLines(result.stderr || result.stdout, 4), stderr: result.stderr };
  }
  return { kind: 'ok', stdout: result.stdout };
}

async function evalOnce(
  shell: DshShell,
  command: string,
  session: string,
  script: string,
  timeoutMs: number,
  retryMs: number,
): Promise<Attempt> {
  const run = async (): Promise<Attempt> => {
    let attempt: Awaited<ReturnType<typeof shellRun>>;
    try {
      attempt = await shellRun(
        shell,
        command,
        ['browser', session, 'eval', script, '--window', 'background'],
        timeoutMs,
      );
    } catch (error) {
      return {
        kind: 'failure',
        result: {
          ok: false,
          code: 'cli-exec-failed',
          message: '读不了：后台服务起不来',
          hint: '确认后台服务能跑起来，再重试',
          detail: error instanceof Error ? error.message : String(error),
        },
      };
    }
    if (attempt.kind === 'timeout') {
      return {
        kind: 'failure',
        result: {
          ok: false,
          code: 'cli-timeout',
          message: '这次没读到（等超时了）',
          hint: '稍后重试',
          detail: attempt.detail,
        },
      };
    }
    if (attempt.kind === 'failed') {
      const normalized = attempt.stderr.trim().toUpperCase().replace(/-/g, '_');
      const forbidden = [...PERMISSION_CODES].some((one) => normalized.includes(one));
      return {
        kind: 'failure',
        result: {
          ok: false,
          code: forbidden ? 'permission-denied' : 'cli-exec-failed',
          message: forbidden ? '没有权限在这台机器上读' : '读不了（命令失败）',
          hint: forbidden ? '换一个有权限的账号，或让用户开权限' : '把下面这段原始输出看一眼再重试',
          detail: attempt.detail,
        },
      };
    }
    const value = parseJsonLoose(attempt.stdout);
    if (value === undefined) {
      return {
        kind: 'failure',
        result: {
          ok: false,
          code: 'cli-exec-failed',
          message: '读到的格式不对',
          hint: '让 agent 检查一下这条读',
          detail: tailLines(attempt.stdout, 4),
        },
      };
    }
    return { kind: 'value', value };
  };

  const first = await run();
  if (first.kind === 'value') return first;
  if (first.result.code !== 'cli-exec-failed') return first;
  await sleep(retryMs);
  return run();
}

async function openOnce(
  shell: DshShell,
  command: string,
  session: string,
  url: string,
  timeoutMs: number,
): Promise<Omit<BrowserReadResult, 'at'> | undefined> {
  let attempt: Awaited<ReturnType<typeof shellRun>>;
  try {
    attempt = await shellRun(shell, command, ['browser', session, 'open', url, '--window', 'background'], timeoutMs);
  } catch (error) {
    return {
      ok: false,
      code: 'cli-exec-failed',
      message: '打不开那个页面',
      hint: '确认后台服务能跑起来，再重试',
      detail: error instanceof Error ? error.message : String(error),
      helpUrl: url,
    };
  }
  if (attempt.kind === 'ok') return undefined;
  return {
    ok: false,
    code: attempt.kind === 'timeout' ? 'cli-timeout' : 'cli-exec-failed',
    message: '打不开那个页面',
    hint: '在浏览器里手动打开一次，然后重试',
    detail: attempt.detail,
    helpUrl: url,
  };
}

export async function browserRead(options: BrowserReadOptions): Promise<BrowserReadResult> {
  const { shell, script, url, loginUrl, open = true } = options;
  const command = options.command ?? 'opencli';
  const session = options.session ?? BROWSER_READ_SESSION;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const at = Date.now();

  const first = await evalOnce(shell, command, session, script, timeoutMs, retryMs);
  if (first.kind === 'failure') return { ...first.result, at };
  let page = first.value;

  if (codeOf(page) === 'not-on-site') {
    if (!open || url === undefined) {
      return {
        ok: false,
        code: 'cli-exec-failed',
        at,
        message: '没停在那套系统上',
        hint: '先在那个浏览器里把它打开，再读一次',
        detail: JSON.stringify(page),
        ...(url === undefined ? {} : { helpUrl: url }),
      };
    }
    const opened = await openOnce(shell, command, session, url, timeoutMs);
    if (opened !== undefined) return { ...opened, at };
    await sleep(settleMs);
    const second = await evalOnce(shell, command, session, script, timeoutMs, retryMs);
    if (second.kind === 'failure') return { ...second.result, at };
    page = second.value;
    if (codeOf(page) === 'not-on-site') {
      return {
        ok: false,
        code: 'cli-exec-failed',
        at,
        message: '打开了页面、又读了一遍，仍然不在那套系统上',
        hint: '确认这个地址就是那套系统（或者它跳到了别的域）',
        detail: JSON.stringify(page),
        helpUrl: url,
      };
    }
  }

  if (!pageFailed(page)) return { ok: true, code: 'ok', at, value: page, message: '读到了' };

  const pageCode = codeOf(page) || 'read-failed';
  const message = messageOf(page) || `读不到（${pageCode}）`;
  const blocker = blockerFor(pageCode);
  if (blocker === 'auth-required') {
    return {
      ok: false,
      code: blocker,
      at,
      pageCode,
      message,
      hint: '去登录一次，再重试',
      detail: JSON.stringify(page),
      ...(loginUrl === undefined && url === undefined ? {} : { helpUrl: loginUrl ?? url }),
    };
  }
  if (blocker === 'permission-denied') {
    return {
      ok: false,
      code: blocker,
      at,
      pageCode,
      message,
      hint: '这个账号没有权限',
      detail: JSON.stringify(page),
      ...(loginUrl === undefined && url === undefined ? {} : { helpUrl: loginUrl ?? url }),
    };
  }
  return {
    ok: false,
    code: pageCode,
    at,
    pageCode,
    message,
    detail: JSON.stringify(page),
    ...(hintOf(page) === undefined ? {} : { hint: hintOf(page) }),
  };
}
