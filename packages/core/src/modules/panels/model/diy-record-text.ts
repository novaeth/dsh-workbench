import type { RecordExpect, RecordMove, RecordRefusal, RecordState } from '@dsh-workbench/shared/host';

import {
  DIY_RECORD_PREPARE_TOOL,
  DIY_RECORD_READ_TOOL,
  DIY_RECORD_STOP_TOOL,
} from '../unit';

const CALLS_SHOWN = 12;

export interface RecordCall {
  readonly key: string;
  readonly method: string;
  readonly url: string;
  readonly body: string;
  readonly status: number;
  readonly ct: string;
  readonly response: string;
  readonly at: number;
  readonly source: 'hook' | 'capture';
}

export interface RecordPageRead {
  readonly ok: boolean;
  readonly code: string;
  readonly phase: string;
  readonly t0: number | null;
  readonly t1: number | null;
  readonly href: string;
  readonly here: string;
  readonly dropped: number;
  readonly unhooked: boolean;
  readonly shots: number;
  readonly shotsAt: number | null;
  readonly beat: boolean;
  readonly beatKind: string;
  readonly calls: readonly RecordCall[];
}

export interface RecordShotLine {
  readonly n: number;
  readonly at: number;
  readonly path: string;
  readonly error?: string;
}

export function recordPageOf(payload: Record<string, unknown> | undefined): RecordPageRead {
  const raw = payload ?? {};
  const calls: RecordCall[] = [];
  const rows = Array.isArray(raw['calls']) ? raw['calls'] : [];
  for (const one of rows) {
    if (typeof one !== 'object' || one === null) continue;
    const row = one as Record<string, unknown>;
    calls.push({
      key: '',
      method: typeof row['method'] === 'string' ? row['method'] : '',
      url: typeof row['url'] === 'string' ? row['url'] : '',
      body: typeof row['body'] === 'string' ? row['body'] : '',
      status: typeof row['status'] === 'number' ? row['status'] : 0,
      ct: typeof row['ct'] === 'string' ? row['ct'] : '',
      response: typeof row['response'] === 'string' ? row['response'] : '',
      at: typeof row['at'] === 'number' ? row['at'] : 0,
      source: 'hook',
    });
  }
  const phase = typeof raw['phase'] === 'string' ? raw['phase'] : 'none';
  return {
    ok: raw['ok'] === true,
    code: typeof raw['code'] === 'string' ? raw['code'] : '',
    phase,
    t0: typeof raw['t0'] === 'number' ? raw['t0'] : null,
    t1: typeof raw['t1'] === 'number' ? raw['t1'] : null,
    href: typeof raw['href'] === 'string' ? raw['href'] : '',
    here: typeof raw['here'] === 'string' ? raw['here'] : '',
    dropped: typeof raw['dropped'] === 'number' ? raw['dropped'] : 0,
    unhooked: raw['unhooked'] === 1 || raw['unhooked'] === true,
    shots: typeof raw['shots'] === 'number' ? raw['shots'] : 0,
    shotsAt: typeof raw['shotsAt'] === 'number' ? raw['shotsAt'] : null,
    beat: raw['beat'] === true,
    beatKind: typeof raw['beatKind'] === 'string' ? raw['beatKind'] : '',
    calls,
  };
}

export function filterTextOf(expect: RecordExpect | null): string {
  const want = expect;
  if (want === null || (want.method === '' && want.urlContains === '')) return '';
  const parts: string[] = [];
  if (want.method !== '') parts.push(want.method);
  if (want.urlContains !== '') parts.push(`url 含 ${want.urlContains}`);
  return parts.join(' · ');
}

export function probeCommandOf(calls: readonly RecordCall[]): string {
  const pick = calls.find((one) => one.body !== '');
  if (pick === undefined) return '';
  return `${pick.method} ${pick.url}\n${pick.body.slice(0, 400)}`;
}

export function bodyMissingOf(calls: readonly RecordCall[]): boolean {
  return calls.length > 0 && calls.every((one) => one.body === '');
}

export function recordRefusalText(code: RecordRefusal, held?: RecordState): string {
  switch (code) {
    case 'held-by-other':
      return `另一场录制还占着（${held === undefined ? '另一个会话' : held.sessionId}）—— 一台机器同时只允许一场：让它先 ${DIY_RECORD_STOP_TOOL}，或等它收工。`;
    case 'already-held':
      return `你这个会话已经持有一场录制（${held === undefined ? '' : `${held.unit}，${held.phase}`}）—— 一台机器同时只允许一场：要换目标、要再来一场，都先 ${DIY_RECORD_STOP_TOOL}，再重新 ${DIY_RECORD_PREPARE_TOOL}（新的一场会再问他一次）。`;
    case 'not-owner':
      return '这一场录制不是你这个会话的 —— 谁开的谁收工。';
    case 'none':
      return '现在没有录制中的那一场。';
    case 'already-recording':
      return '已经在录了 —— 请他按「结束录制」，再调这一次。';
    case 'not-armed':
      return `这一场已经录完了 —— 再录就是新的一场：先 ${DIY_RECORD_STOP_TOOL}，再重新 ${DIY_RECORD_PREPARE_TOOL}（会再问他一次）。`;
    case 'not-recording':
      return '还没开始录（他还没按「开始录制」）—— 先请他按开始。';
    case 'not-finished':
      return `这一场还没录完 —— 等他按「结束录制」，再 ${DIY_RECORD_READ_TOOL} 或 ${DIY_RECORD_STOP_TOOL}。`;
  }
}

export function recordMissingText(): string {
  return `现在没有录制中的那一场（${DIY_RECORD_PREPARE_TOOL} 起的那一场可能已经过期或收工了）—— 先调 ${DIY_RECORD_PREPARE_TOOL}。`;
}

export function recordTalkOf(): string {
  return '已开始录制';
}

export interface RecordListRow {
  readonly index: number;
  readonly key: string;
  readonly at: number;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly ct: string;
  readonly size: number;
  readonly source: 'hook' | 'capture';
  readonly hasRequest: boolean;
  readonly hasResponse: boolean;
  readonly likelyWrite: boolean;
  readonly marked: boolean;
}

function noFilter(expect: RecordExpect | null): boolean {
  return expect === null || (expect.method === '' && expect.urlContains === '');
}

function matchesExpect(one: RecordCall, expect: RecordExpect | null): boolean {
  if (noFilter(expect)) return false;
  const want = expect as RecordExpect;
  if (want.method !== '' && one.method !== want.method) return false;
  if (want.urlContains !== '' && !one.url.includes(want.urlContains)) return false;
  return true;
}

export function listRowsOf(calls: readonly RecordCall[], expect: RecordExpect | null): readonly RecordListRow[] {
  const rows: RecordListRow[] = calls.map((one, index) => {
    const hasRequest = one.body !== '';
    const hasResponse = one.response !== '';
    const likelyWrite = one.method !== 'GET' || hasRequest;
    return {
      index,
      key: one.key,
      at: one.at,
      method: one.method,
      url: one.url,
      status: one.status,
      ct: one.ct,
      size: one.response.length === 0 ? 0 : one.response.length,
      source: one.source,
      hasRequest,
      hasResponse,
      likelyWrite,
      marked: matchesExpect(one, expect) || (noFilter(expect) && likelyWrite),
    };
  });
  return rows
    .slice()
    .sort((left, right) => Number(right.marked) - Number(left.marked) || left.at - right.at)
    .map((one, index) => ({ ...one, index }));
}

function sizeText(bytes: number): string {
  if (bytes <= 0) return '无';
  if (bytes < 1024) return `${String(bytes)} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function rowTextOf(one: RecordListRow): string {
  const mark = one.marked ? ' ⭐' : '  ';
  const where = one.source === 'capture' ? '捕获' : '钩子';
  const identity = one.key === '' ? `${one.method} ${one.url}` : one.key;
  const how = one.key === '' ? '无 key' : `at ${String(one.at)}`;
  return `· [${String(one.index)}]${mark} ${identity}（${where} · 入参 ${one.hasRequest ? '有' : '无'} · 出参 ${sizeText(one.size)} · ${how}）`;
}

export interface RecordReadFacts {
  readonly phase: string;
  readonly armed: boolean;
  readonly hookCaught: number;
  readonly rows: readonly RecordListRow[];
  readonly merged: number;
  readonly capturedLines: number;
  readonly capturedInSegment: number;
  readonly capturedOutside: number;
  readonly capturedTotalLines: number;
  readonly capturedTruncated: boolean;
  readonly capturedTailLimit: number;
  readonly dropped: number;
  readonly nav: boolean;
  readonly filter: string;
  readonly captureRound: string;
  readonly shots?: readonly RecordShotLine[];
  readonly beats?: number;
  readonly beatMs?: number;
}

function shortPath(path: string): string {
  const at = path.lastIndexOf('shots/');
  return at >= 0 ? path.slice(at) : path;
}

function shotFaultLines(shots: readonly RecordShotLine[]): readonly string[] {
  return shots
    .filter((one) => one.error !== undefined)
    .map((one) => `（他按了「截图」，但有一张图没落下来：${shortPath(one.path)} —— ${one.error ?? ''}）`);
}

function beatLineOf(beats: number, beatMs: number): string {
  return beats > 0 ? `门铃：${String(beats)} 次（最近 ${String(beatMs)} 毫秒）` : '';
}

function evidenceTailOf(shots: readonly RecordShotLine[], beats: number, beatMs: number): string {
  const parts: string[] = [];
  const landed = shots.filter((one) => one.error === undefined).length;
  if (landed > 0) parts.push(`图 ${String(landed)} 张`);
  const beat = beatLineOf(beats, beatMs);
  if (beat !== '') parts.push(beat);
  return parts.join(' · ');
}

export function renderRecordRead(input: RecordReadFacts): string {
  const shots = input.shots ?? [];
  const tail = evidenceTailOf(shots, input.beats ?? 0, input.beatMs ?? 0);
  const sep = tail === '' ? '' : ` · ${tail}`;
  const faults = shotFaultLines(shots);
  if (!input.armed) {
    return `那一页上还没有录制条（${DIY_RECORD_PREPARE_TOOL} 起的那一场可能被导航冲掉了）—— 先 ${DIY_RECORD_PREPARE_TOOL}，或让他回到那一页再 ${DIY_RECORD_READ_TOOL}。`;
  }
  if (input.phase === 'armed') return '他还没按「开始录制」—— 等他按了再读。';
  if (input.phase === 'recording') {
    return [
      `还在录（页面钩子上已经攒了 ${String(input.hookCaught)} 条）—— 等他按「结束录制」。${sep}`,
      ...faults,
    ].join('\n');
  }
  const marked = input.rows.filter((one) => one.marked);
  const markShown = marked.slice(0, CALLS_SHOWN);
  const restShown = input.rows
    .filter((one) => !one.marked)
    .slice(-Math.max(0, CALLS_SHOWN - markShown.length));
  const shown = [...markShown, ...restShown];
  const truncatedNote = input.capturedTruncated
    ? [
        input.capturedTotalLines > input.capturedTailLimit
          ? `（捕获文件这一场一共落了 ${String(input.capturedTotalLines)} 行，这里只解析了最后 ${String(input.capturedTailLimit)} 行 —— 更早的没看；下面的清单只对最后这段成立）`
          : `（捕获文件这一场一共落了 ${String(input.capturedTotalLines)} 行（没顶到 ${String(input.capturedTailLimit)} 行那顶帽），是**这一读本身被输出上限截了** —— 读到的只是最近一段，下面的清单只对读到的这段成立）`,
      ]
    : [];
  const lines: string[] = [...truncatedNote, ...faults];
  if (input.rows.length > 0) {
    lines.push(`录完了 · ${String(input.merged)} 条（⭐ ${String(marked.length)}）${sep}`, ...shown.map(rowTextOf));
  } else {
    lines.push(
      input.capturedTruncated
        ? `录完了：这一段（就解析到的那部分而言）一条请求都没抓到（页面钩子 0 条 · 解析到的会话捕获里落在这个时间段里 0 条）—— 但捕获文件被截过，见上面那行。${sep}`
        : `录完了：这一段一条请求都没抓到（页面钩子 0 条 · 会话捕获落在这个时间段里 0 条，两边都是 0 —— 不是筛掉的）。${sep}`,
    );
  }
  if (input.dropped > 0) lines.push(`（缓冲区满了，最早丢了 ${String(input.dropped)} 条）`);
  if (input.captureRound === 'fail') {
    lines.push('（会话捕获最近一轮没跑成 —— 这一场可能只有页面钩子。）');
  } else if (input.captureRound === '') {
    lines.push('（会话捕获还没回过一轮 —— 再等一拍再看，别急着下"没抓到"的结论。）');
  }
  if (input.capturedLines === 0 && !input.capturedTruncated) {
    lines.push('（会话捕获一条都没落 —— 这次只有页面钩子。请求体抓不到时请他打开 DevTools 把那次请求复制成 curl）');
  }
  if (input.nav) lines.push('（这一段里那一页导航过 —— 浮条重新注入过，导航前的那几条可能不在）');
  return lines.join('\n');
}

export interface RecordDetailFacts {
  readonly found: boolean;
  readonly where: string;
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly ct: string;
  readonly at: number;
  readonly request: string;
  readonly response: string;
  readonly headers: string;
  readonly requestFullSize: number;
  readonly responseFullSize: number;
  readonly requestSizeExact: boolean;
  readonly responseSizeExact: boolean;
  readonly ambiguous: number;
  readonly source: string;
  readonly maxBytes: number;
  readonly note: string;
}

function clip(text: string, maxBytes: number): { readonly text: string; readonly cut: boolean } {
  if (maxBytes <= 0 || text.length <= maxBytes) return { text, cut: false };
  return { text: text.slice(0, maxBytes), cut: true };
}

function sizeLabel(size: number, exact: boolean): string {
  return exact ? `${String(size)} 字节` : `${String(size)} 字符（没给 body_full_size，按字符数算）`;
}

export function renderRecordDetail(input: RecordDetailFacts): string {
  if (!input.found) {
    return [
      `没找到这一条：${input.note}`,
      `可用的取法：② 还在这场录制里时用清单里的 key 或 index；③ 这一场已经收工的话，给 unit 让我去读 shots/rec-<unit>.jsonl.last；④ 都不行就让他打开 DevTools，把那次请求复制成 curl。`,
    ].join('\n');
  }
  const req = clip(input.request, input.maxBytes);
  const res = clip(input.response, input.maxBytes);
  const status = input.status === 0 ? '回包还没到（status 0）' : String(input.status);
  const lines = [
    `${input.method} ${input.url} · ${status}${input.ct === '' ? '' : ` · ${input.ct}`}`,
    `（${input.where} · ${new Date(input.at).toISOString()}）`,
  ];
  lines.push(
    req.text === ''
      ? '入参（request body）：没有'
      : `入参（request body，原长 ${sizeLabel(input.requestFullSize, input.requestSizeExact)}${req.cut ? `，这里截到 ${String(input.maxBytes)}` : ''}）：\n${req.text}`,
  );
  lines.push(
    res.text === ''
      ? '出参（response body）：没有'
      : `出参（response body，原长 ${sizeLabel(input.responseFullSize, input.responseSizeExact)}${res.cut ? `，这里截到 ${String(input.maxBytes)}` : ''}）：\n${res.text}`,
  );
  if (input.headers !== '') lines.push(`请求头（可能含凭据 —— 别落进 design.json）：${input.headers}`);
  if (input.ambiguous > 1) {
    lines.push(
      `（这个 key 在这一场的原文里出现 ${String(input.ambiguous)} 次 —— 跨轮会重名；带上清单里那一行的 at 才钉得住是哪一次。）`,
    );
  }
  if (input.note !== '') lines.push(`（${input.note}）`);
  return lines.join('\n');
}

export function moveOrThrow(move: RecordMove, held: RecordState | null): RecordState {
  if (move.ok) return move.state;
  throw new Error(recordRefusalText(move.code, held ?? undefined));
}

function plain(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function domainOf(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return '';
  }
}

export function readDomainsOf(design: unknown): readonly string[] {
  const root = plain(design);
  const many = root['reads'];
  const one = root['datasource'];
  const rows = Array.isArray(many) ? many : one === undefined ? [] : [one];
  const found = new Set<string>();
  for (const row of rows) {
    const read = plain(row)['read'];
    if (typeof read !== 'string') continue;
    for (const match of read.matchAll(/https?:\/\/[^\s"'`)\\]+/g)) {
      const domain = domainOf(match[0]);
      if (domain !== '') found.add(domain);
    }
  }
  return [...found];
}
