import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import type { RecordState, RecordStore } from '@dsh-workbench/shared/host';
import { quoteShellArg, runShell, shotDueOf } from '@dsh-workbench/shared/host';
import { plainLine, type LineMaker } from './diy-browser';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';

import { dirname, join } from 'node:path';
import { deliverDebugNotice, noticeMessage, type AgentsLookup } from '@/shared/api/host/diy-debug-act';
import { actBrowser, actErrorOf, stopNetworkExact } from './diy-browser-act';
import { RECORD_READ_SCRIPT } from './diy-record-scripts';
import { captureCallsOf, captureEntriesOf, mergeCalls, segmentOf } from './diy-record-capture';
import type { CaptureEntry } from './diy-record-capture';
import { domainOf, listRowsOf, readDomainsOf, recordPageOf, renderRecordDetail } from './diy-record-text';
import type { RecordCall, RecordDetailFacts, RecordListRow, RecordPageRead } from './diy-record-text';
import { plainJson } from './diy-context';
import { DIY_RECORD_DETAIL_TOOL, DIY_RECORD_READ_TOOL } from '../unit';

export const OPEN_TIMEOUT_MS = 30000;
const START_TIMEOUT_MS = 8000;
export const SETTLE_MS = 2000;
export const WAIT_CAP_MS = 15 * 60 * 1000;
export const POLL_MS = 1000;
const CAPTURE_TAIL_LINES = 20000;
const CAPTURE_POLL_S = 3;
const CAPTURE_ARM_S = 2;

export const STATIC_URL_PATTERN = `^(data:)|(\\.(js|css|png|jpe?g|gif|svg|woff2?|ico|map|webp|mp4)(\\?|$))`;
const RECORD_WATCH_MS = 3000;
const RECORD_WATCH_TRIES = 5;
const DROP_STATIC_JS =
  'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>{const re=new RegExp(process.argv[1],"i");for(const line of s.split("\\n")){const t=line.trim();if(t==="")continue;let one;try{one=JSON.parse(t)}catch{process.stdout.write(t+"\\n");continue}if(Array.isArray(one.entries)){one.entries=one.entries.filter((e)=>!re.test(String((e||{}).url||"")));if(one.entries.length===0)continue}process.stdout.write(JSON.stringify(one)+"\\n")}});';
export const DETAIL_MAX_BYTES = 60000;

const HOST_PID = String(process.pid);

export const pauseFor = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

export function waitOf(value: unknown): number {
  const raw = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.min(Math.max(raw, 0), WAIT_CAP_MS);
}

export function foreignDomainText(design: unknown, url: string): string {
  const known = readDomainsOf(design);
  if (known.length === 0) return '';
  const domain = domainOf(url);
  if (domain === '' || known.includes(domain)) return '';
  return (
    `这一页（${domain}）跟这个模块已经探明的读源（${known.join(' / ')}）不是一个域 —— ` +
    '录下来的请求原文要留在本机（工作台的取证目录），不许跨域录。换成它那个域的页面，或者先把这个模块的读源说清。'
  );
}

export function captureFileOf(artifactsDir: string, unit: string): string {
  return join(artifactsDir, `rec-${unit}.jsonl`);
}

export function lastCaptureFileOf(file: string): string {
  return `${file}.last`;
}

export function shotFileOf(captureFile: string, unit: string, n: number): string {
  return join(dirname(captureFile), `rec-shot-${unit}-${n}.png`);
}

export async function takeShotOf(input: WatchFinishDeps, held: RecordState, n: number): Promise<void> {
  const path = shotFileOf(input.captureFile, held.unit, n);
  const at = Date.now();
  try {
    const step = await actBrowser(input.shell, input.command, BROWSER_RECORD_SESSION, ['screenshot', path]);
    if (step.ok) input.store.shotTaken(input.sessionId, { n, at, path }, Date.now());
    else input.store.shotFailed(input.sessionId, { n, at, path, error: actErrorOf(step) }, Date.now());
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    input.store.shotFailed(input.sessionId, { n, at, path, error: text }, Date.now());
  }
}

export async function startRecordCapture(
  shell: DshShell,
  command: string,
  session: string,
  file: string,
  makeLine: LineMaker = plainLine,
): Promise<boolean> {
  const bin = command === '' ? 'runtime' : command;
  const arm = makeLine(bin, ['browser', session, 'network', '--follow', '--all', '--window', 'background']);
  const snap = makeLine(bin, ['browser', session, 'network', '--all', '--raw', '--window', 'background']);
  const line = [
    `f=${quoteShellArg(file)}`,
    `r=${quoteShellArg(`${file}.round`)}`,
    ': > "$f"',
    'rm -f "$f.last" "$f.first" "$r"',
    `( ${arm} >> "$f" 2>/dev/null & p=$!; sleep ${String(CAPTURE_ARM_S)}; kill "$p" 2>/dev/null )`,
    `( while kill -0 ${HOST_PID} 2>/dev/null; do if ${snap} > "$r" 2>/dev/null; then printf ok > "$f.first"; else printf fail > "$f.first"; fi; if [ -s "$r" ]; then if command -v node >/dev/null 2>&1; then tr -d '\\n' < "$r" | node -e ${quoteShellArg(DROP_STATIC_JS)} ${quoteShellArg(STATIC_URL_PATTERN)} >> "$f"; else tr -d '\\n' < "$r" >> "$f"; printf '\\n' >> "$f"; fi; fi; rm -f "$r"; sleep ${String(CAPTURE_POLL_S)}; done & echo $! > "$f.pid" ) & echo $! > "$f.reaper"`,
    'kill -0 "$(cat "$f.pid" 2>/dev/null)" 2>/dev/null',
  ].join('; ');
  const step = await runShell(shell, line, { timeoutMs: START_TIMEOUT_MS });
  return step.exitCode === 0;
}

export interface WatchFinishDeps {
  readonly ctx: DshHostContext;
  readonly shell: DshShell;
  readonly command: string;
  readonly sessionId: string;
  readonly store: RecordStore;
  readonly url: string;
  readonly captureFile: string;
}

async function releaseLeftoversOf(input: WatchFinishDeps): Promise<void> {
  await releaseQuietly({
    shell: input.shell,
    command: input.command,
    session: BROWSER_RECORD_SESSION,
    url: input.url,
    captureFile: input.captureFile,
  });
}

async function stopCaptureQuiet(input: WatchFinishDeps): Promise<boolean> {
  try {
    return await stopNetworkExact(input.shell, input.captureFile);
  } catch {
    return false;
  }
}

async function closeRecordTabQuiet(input: WatchFinishDeps): Promise<boolean> {
  try {
    return await closeRecordTab(input.shell, input.command, BROWSER_RECORD_SESSION, input.url);
  } catch {
    return false;
  }
}

export async function watchFinishStepOf(
  input: WatchFinishDeps,
): Promise<{ readonly stop: boolean; readonly delivered: boolean }> {
  const live = input.store.live(Date.now());
  if (live === null) {
    await releaseLeftoversOf(input);
    return { stop: true, delivered: false };
  }
  if (live.sessionId !== input.sessionId) return { stop: true, delivered: false };
  if (live.phase === 'finished') {
    await closeRecordTabQuiet(input);
    return { stop: true, delivered: false };
  }
  let page: ReturnType<typeof recordPageOf>;
  const started = Date.now();
  try {
    const step = await actBrowser(input.shell, input.command, BROWSER_RECORD_SESSION, ['eval', RECORD_READ_SCRIPT]);
    page = recordPageOf(step.payload);
  } catch {
    return { stop: false, delivered: false };
  }
  if (page.beat) input.store.beat(input.sessionId, Math.max(0, Date.now() - started), Date.now());
  const held = input.store.live(Date.now());
  if (held === null) {
    await releaseLeftoversOf(input);
    return { stop: true, delivered: false };
  }
  if (held.sessionId !== input.sessionId) return { stop: true, delivered: false };
  if (held.phase === 'finished') {
    await stopCaptureQuiet(input);
    await closeRecordTabQuiet(input);
    return { stop: true, delivered: false };
  }
  if (!page.ok) return { stop: false, delivered: false };
  const due = shotDueOf(held, page.shots);
  if (due !== null) await takeShotOf(input, held, due);
  if (page.phase === 'finished' && page.t1 !== null) {
    const now = Date.now();
    if (held.phase === 'armed') input.store.started(input.sessionId, page.t0 ?? 0, now);
    if (input.store.live(Date.now())?.phase === 'recording') {
      input.store.finished(input.sessionId, page.t1, now);
    }
    const caught = page.calls.length;
    const summary = `工作台 DIY：用户按了「结束录制」（${String(caught)} 条）`;
    deliverDebugNotice(
      input.ctx.get<AgentsLookup>('agents'),
      input.sessionId,
      noticeMessage(
        `用户按了「结束录制」（页面钩子上 ${String(caught)} 条）—— 去 ${DIY_RECORD_READ_TOOL} 取这一段清单，要某一条原文用 ${DIY_RECORD_DETAIL_TOOL}。`,
        summary,
      ),
      'wake',
    );
    await stopCaptureQuiet(input);
    await closeRecordTabQuiet(input);
    return { stop: true, delivered: true };
  }
  if (page.phase === 'recording' && page.t0 !== null && held.phase === 'armed') {
    input.store.started(input.sessionId, page.t0, Date.now());
  }
  return { stop: false, delivered: false };
}

export interface WatchRoundOut {
  readonly stop: boolean;
  readonly delivered: boolean;
}

export async function watchRoundOf(input: WatchFinishDeps): Promise<WatchRoundOut> {
  return watchFinishStepOf(input);
}

export function watchRecordFinish(input: WatchFinishDeps): void {
  let misses = 0;
  const tick = (): void => {
    void watchRoundOf(input)
      .then((out) => {
        misses = 0;
        if (!out.stop) setTimeout(tick, 0);
      })
      .catch(() => {
        misses += 1;
        if (misses < RECORD_WATCH_TRIES) setTimeout(tick, RECORD_WATCH_MS);
      });
  };
  setTimeout(tick, 0);
}

export interface CaptureRead {
  readonly text: string;
  readonly totalLines: number;
  readonly tailLimit: number;
  readonly truncated: boolean;
  readonly round: string;
}

export async function captureLinesOf(shell: DshShell, file: string, timeoutMs = START_TIMEOUT_MS): Promise<number> {
  const step = await runShell(shell, `wc -l < ${quoteShellArg(file)} 2>/dev/null || echo 0`, { timeoutMs });
  const value = Number.parseInt(step.stdout.trim() === '' ? '0' : step.stdout.trim(), 10);
  return Number.isFinite(value) ? value : 0;
}

export async function captureRoundOf(shell: DshShell, file: string, timeoutMs = START_TIMEOUT_MS): Promise<string> {
  const step = await runShell(shell, `cat ${quoteShellArg(`${file}.first`)} 2>/dev/null || true`, { timeoutMs });
  const value = step.stdout.trim();
  return value === 'ok' || value === 'fail' ? value : '';
}

export async function captureTextOf(
  shell: DshShell,
  file: string,
  timeoutMs = START_TIMEOUT_MS,
): Promise<{ readonly text: string; readonly truncated: boolean }> {
  const step = await runShell(
    shell,
    `tail -n ${String(CAPTURE_TAIL_LINES)} ${quoteShellArg(file)} 2>/dev/null || true`,
    { timeoutMs },
  );
  return { text: step.stdout, truncated: step.truncated };
}

export async function captureReadOf(shell: DshShell, file: string, timeoutMs = START_TIMEOUT_MS): Promise<CaptureRead> {
  const totalLines = await captureLinesOf(shell, file, timeoutMs);
  const read = await captureTextOf(shell, file, timeoutMs);
  const round = await captureRoundOf(shell, file, timeoutMs);
  return {
    text: read.text,
    totalLines,
    tailLimit: CAPTURE_TAIL_LINES,
    truncated: read.truncated || totalLines > CAPTURE_TAIL_LINES,
    round,
  };
}

export async function keepCaptureOf(shell: DshShell, file: string, timeoutMs = START_TIMEOUT_MS): Promise<boolean> {
  const line = `[ -f ${quoteShellArg(file)} ] && mv ${quoteShellArg(file)} ${quoteShellArg(lastCaptureFileOf(file))} && [ -s ${quoteShellArg(lastCaptureFileOf(file))} ]`;
  const step = await runShell(shell, line, { timeoutMs });
  return step.exitCode === 0;
}

export async function captureLinesWithKeyOf(
  shell: DshShell,
  file: string,
  key: string,
  timeoutMs = START_TIMEOUT_MS,
): Promise<string> {
  const quoted = quoteShellArg(file);
  const compact = quoteShellArg(`"key":"${key}"`);
  const spaced = quoteShellArg(`"key": "${key}"`);
  const line = [
    `[ -f ${quoted} ] || exit 0`,
    `grep -m 20 -F ${compact} ${quoted} 2>/dev/null || grep -m 20 -F ${spaced} ${quoted} 2>/dev/null || true`,
  ].join('; ');
  const step = await runShell(shell, line, { timeoutMs });
  return step.stdout;
}

export interface SegmentBundle {
  readonly capture: CaptureRead;
  readonly entries: readonly CaptureEntry[];
  readonly inside: readonly CaptureEntry[];
  readonly outside: number;
  readonly merged: readonly RecordCall[];
  readonly rows: readonly RecordListRow[];
}

export function bundleOf(capture: CaptureRead, page: RecordPageRead, state: RecordState): SegmentBundle {
  const entries = captureEntriesOf(capture.text);
  const segment = segmentOf(entries, page.t0 ?? state.t0, page.t1 ?? state.t1);
  const merged = mergeCalls(page.calls, captureCallsOf(segment.inside));
  return {
    capture,
    entries,
    inside: segment.inside,
    outside: segment.outside,
    merged,
    rows: listRowsOf(merged, state.expect),
  };
}

export function hookCallOf(page: RecordPageRead, key: string): RecordCall | null {
  const want = key.trim();
  const bare = want.replace(/#\d+$/, '');
  for (const one of page.calls) {
    if (one.key !== '' && one.key === want) return one;
    if (`${one.method} ${one.url}` === bare) return one;
  }
  return null;
}

const DETAIL_WHERE_CAPTURE = '会话捕获（浏览器那一层，快照原文）';
const DETAIL_WHERE_HOOK = '页面钩子（这一段）';

function detailFactsOf(input: RecordDetailFacts & { readonly key: string }): Record<string, unknown> {
  return plainJson({
    ok: true,
    found: true,
    key: input.key,
    method: input.method,
    url: input.url,
    status: input.status,
    ct: input.ct,
    at: input.at,
    request: input.request,
    response: input.response,
    headers: input.headers,
    requestFullSize: input.requestFullSize,
    responseFullSize: input.responseFullSize,
    requestSizeExact: input.requestSizeExact,
    responseSizeExact: input.responseSizeExact,
    ambiguous: input.ambiguous,
    source: input.source,
    text: renderRecordDetail(input),
  });
}

export function detailOfEntry(entry: CaptureEntry, maxBytes: number, ambiguous = 1): Record<string, unknown> {
  return detailFactsOf({
    found: true,
    where: DETAIL_WHERE_CAPTURE,
    key: entry.key,
    method: entry.method,
    url: entry.url,
    status: entry.status,
    ct: entry.ct,
    at: entry.at,
    request: entry.request,
    response: entry.response,
    headers: entry.headers,
    requestFullSize: entry.requestFullSize,
    responseFullSize: entry.responseFullSize,
    requestSizeExact: entry.requestSizeExact,
    responseSizeExact: entry.responseSizeExact,
    ambiguous,
    source: 'capture',
    maxBytes,
    note: '',
  });
}

export function detailOfCall(call: RecordCall, maxBytes: number): Record<string, unknown> {
  return detailFactsOf({
    found: true,
    where: DETAIL_WHERE_HOOK,
    key: call.key,
    method: call.method,
    url: call.url,
    status: call.status,
    ct: call.ct,
    at: call.at,
    request: call.body,
    response: call.response,
    headers: '',
    requestFullSize: call.body.length,
    responseFullSize: call.response.length,
    requestSizeExact: false,
    responseSizeExact: false,
    ambiguous: 0,
    source: 'hook',
    maxBytes,
    note: '',
  });
}

function blanksOf(pages: readonly Record<string, unknown>[] | null, keep: string): readonly string[] {
  if (pages === null) return [];
  return pages
    .filter((one) => typeof one['url'] === 'string' && (one['url'] === '' || one['url'] === 'about:blank'))
    .map((one) => (typeof one['page'] === 'string' ? one['page'] : ''))
    .filter((one) => one !== '' && one !== keep);
}

function tabsOf(raw: string): readonly Record<string, unknown>[] | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null);
  } catch {
    return null;
  }
}

async function closeRecordTab(shell: DshShell, command: string, session: string, url: string): Promise<boolean> {
  const listed = await actBrowser(shell, command, session, ['tab', 'list']);
  const pages = tabsOf(listed.stdout);
  if (pages !== null && pages.length === 0) return true;
  const exact = pages?.find((one) => typeof one['url'] === 'string' && one['url'] === url);
  const pick = exact ?? pages?.[0];
  const page = pick === undefined ? '' : typeof pick['page'] === 'string' ? pick['page'] : '';
  if (page !== '') {
    const done = await actBrowser(shell, command, session, ['tab', 'close', page]);
    if (done.ok) {
      for (const one of blanksOf(pages, page)) {
        await actBrowser(shell, command, session, ['tab', 'close', one]);
      }
      await actBrowser(shell, command, session, ['close']);
      return true;
    }
  }
  const released = await actBrowser(shell, command, session, ['close']);
  return released.ok;
}

export async function releaseRecord(input: {
  readonly shell: DshShell;
  readonly command: string;
  readonly session: string;
  readonly url: string;
  readonly captureFile: string;
}): Promise<{ readonly tab: boolean; readonly capture: boolean }> {
  const capture = await stopNetworkExact(input.shell, input.captureFile);
  const tab = await closeRecordTab(input.shell, input.command, input.session, input.url);
  return { tab, capture };
}

export async function releaseQuietly(input: {
  readonly shell: DshShell;
  readonly command: string;
  readonly session: string;
  readonly url: string;
  readonly captureFile: string;
}): Promise<{ readonly tab: boolean; readonly capture: boolean }> {
  try {
    return await releaseRecord(input);
  } catch {
    return { tab: false, capture: false };
  }
}
