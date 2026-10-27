import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared';
import { OUTPUT, plainJson } from './diy-context';
import { pageAt } from './diy-page';
import { actBrowser, actErrorOf } from './diy-browser-act';
import { DIY_LOGS_READ_TOOL, DIY_LOGS_STOP_TOOL, DIY_LOGS_WATCH_TOOL } from '../unit';

const LOGS_KEY = '__dshDiyLogs';
const LOGS_CAP = 200;
const LOGS_TEXT_MAX = 400;
const LOGS_SHOW = 50;
const LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;

export const LOGS_ARM_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(LOGS_KEY)};
  const CAP = ${String(LOGS_CAP)};
  const TEXT_MAX = ${String(LOGS_TEXT_MAX)};
  const LEVELS = ${JSON.stringify(LEVELS)};
  let buf = window[KEY];
  if (!Array.isArray(buf)) {
    buf = [];
    window[KEY] = buf;
  }
  const textOf = (value) => {
    try {
      if (typeof value === 'string') return value;
      const json = JSON.stringify(value);
      return typeof json === 'string' ? json : String(value);
    } catch (error) {
      return '[unprintable]';
    }
  };
  let hooked = 0;
  for (const level of LEVELS) {
    const current = console[level];
    if (typeof current === 'function' && current.__dshDiy === true) continue;
    const real = typeof current === 'function' ? current.bind(console) : () => {};
    const patched = (...args) => {
      try {
        buf.push({ level, text: args.map(textOf).join(' ').slice(0, TEXT_MAX), at: Date.now() });
        if (buf.length > CAP) buf.splice(0, buf.length - CAP);
      } catch (error) {}
      return real(...args);
    };
    patched.__dshDiy = true;
    patched.__real = typeof current === 'function' ? current : null;
    console[level] = patched;
    hooked += 1;
  }
  return { ok: true, cap: CAP, levels: LEVELS.length, hooked, size: buf.length };
})()`;

export const LOGS_READ_SCRIPT = `(() => {
  const buf = window[${JSON.stringify(LOGS_KEY)}];
  if (!Array.isArray(buf)) return { ok: false, code: 'not-armed', seen: 0, lines: [] };
  return { ok: true, seen: buf.length, lines: buf.slice(-${String(LOGS_CAP)}) };
})()`;

export const LOGS_STOP_SCRIPT = `(() => {
  const KEY = ${JSON.stringify(LOGS_KEY)};
  const LEVELS = ${JSON.stringify(LEVELS)};
  const buf = window[KEY];
  const dropped = Array.isArray(buf) ? buf.length : 0;
  let unhooked = 0;
  for (const level of LEVELS) {
    const current = console[level];
    if (typeof current !== 'function' || current.__dshDiy !== true) continue;
    if (typeof current.__real === 'function') console[level] = current.__real;
    else delete console[level];
    unhooked += 1;
  }
  try {
    delete window[KEY];
  } catch (error) {
    window[KEY] = undefined;
  }
  return { ok: true, unhooked, dropped };
})()`;

export interface LogLine {
  readonly level: string;
  readonly text: string;
  readonly at: number;
}

export interface LogsRead {
  readonly ok: boolean;
  readonly code: string;
  readonly seen: number;
  readonly lines: readonly LogLine[];
}

export function logsReadOf(payload: Record<string, unknown> | undefined): LogsRead {
  const raw = payload ?? {};
  const lines = Array.isArray(raw['lines']) ? raw['lines'] : [];
  const kept: LogLine[] = [];
  for (const one of lines) {
    if (typeof one !== 'object' || one === null) continue;
    const record = one as Record<string, unknown>;
    const text = typeof record['text'] === 'string' ? record['text'] : '';
    if (text === '') continue;
    kept.push({
      level: typeof record['level'] === 'string' && record['level'] !== '' ? record['level'] : 'log',
      text,
      at: typeof record['at'] === 'number' ? record['at'] : 0,
    });
  }
  const seen = typeof raw['seen'] === 'number' ? raw['seen'] : kept.length;
  return {
    ok: raw['ok'] === true,
    code: typeof raw['code'] === 'string' ? raw['code'] : '',
    seen: Math.max(seen, kept.length),
    lines: kept,
  };
}

export function renderLogs(read: LogsRead): string {
  if (!read.ok) {
    return (
      '这一页上还没有钩子（看不到控制台）—— 先 workbench_diy_logs_watch 装上，' +
      '做完你要看的那件事，再 workbench_diy_logs_read。'
    );
  }
  if (read.lines.length === 0) {
    return '钩子装上了，但这一页到现在一条 console.* 都没打过。';
  }
  const shown = read.lines.slice(-LOGS_SHOW);
  const more =
    read.seen > shown.length ? `（攒了 ${String(read.seen)} 条，这里只列最近 ${String(shown.length)} 条）` : '';
  return [
    `这一页最近 ${String(shown.length)} 条控制台${more}：`,
    ...shown.map((one) => `[${one.level}] ${one.text}`),
  ].join('\n');
}

export function registerLogTools(ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  const sessionProp = { type: 'string', description: '会话名（默认 workbench，一般不用填）。' };
  const schema = {
    type: 'object',
    properties: { session: sessionProp },
    additionalProperties: false,
  };

  async function run(exec: DshToolRunContext, raw: unknown, script: string) {
    const page = await pageAt(ctx, exec, raw, { requireUnit: false, requireWorkbench: false });
    const step = await actBrowser(page.shell, page.command, page.session, ['eval', script]);
    return { page, step };
  }

  const watchTool: DshToolDefinition = {
    name: DIY_LOGS_WATCH_TOOL,
    description: '把这一页的控制台听上（每页最多 200 条、单条截 400 字，随页面刷新消失）。',
    parameters: schema,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { page, step } = await run(exec, raw, LOGS_ARM_SCRIPT);
      const error = actErrorOf(step);
      const hooked = typeof step.payload?.['hooked'] === 'number' ? step.payload['hooked'] : 0;
      const size = typeof step.payload?.['size'] === 'number' ? step.payload['size'] : 0;
      const text =
        error !== ''
          ? `没听上：${error}`
          : hooked === 0
            ? `已经在听了（钩子还在，攒着 ${String(size)} 条）。做完那件事用 ${DIY_LOGS_READ_TOOL} 读。`
            : `听上了（装了 ${String(hooked)} 个钩子，最多 ${String(LOGS_CAP)} 条）：去做你要看的那件事，` +
              `回头用 ${DIY_LOGS_READ_TOOL} 读；读完用 ${DIY_LOGS_STOP_TOOL} 卸掉。`;
      return plainJson({ workspace: page.root, ok: step.ok && error === '', hooked, cap: LOGS_CAP, text });
    },
  };

  const readTool: DshToolDefinition = {
    name: DIY_LOGS_READ_TOOL,
    description: '读刚才听下来的控制台（最近 50 条；没装钩子会说清，不假装是"没有报错"）。',
    parameters: schema,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { page, step } = await run(exec, raw, LOGS_READ_SCRIPT);
      const error = actErrorOf(step);
      const read = logsReadOf(step.payload);
      const text = error !== '' ? `读不到：${error}` : renderLogs(read);
      return plainJson({
        workspace: page.root,
        ok: step.ok && error === '',
        seen: read.seen,
        lines: read.lines.slice(-LOGS_SHOW),
        text,
      });
    },
  };

  const stopTool: DshToolDefinition = {
    name: DIY_LOGS_STOP_TOOL,
    description: '控制台收听收工：卸掉钩子、扔掉攒下的记录。',
    parameters: schema,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { page, step } = await run(exec, raw, LOGS_STOP_SCRIPT);
      const error = actErrorOf(step);
      const unhooked = typeof step.payload?.['unhooked'] === 'number' ? step.payload['unhooked'] : 0;
      const dropped = typeof step.payload?.['dropped'] === 'number' ? step.payload['dropped'] : 0;
      const text =
        error !== ''
          ? `没卸干净：${error}`
          : `收工了：卸掉 ${String(unhooked)} 个钩子、扔掉 ${String(dropped)} 条记录。`;
      return plainJson({ workspace: page.root, ok: step.ok && error === '', unhooked, dropped, text });
    },
  };

  return [tools.register(watchTool), tools.register(readTool), tools.register(stopTool)];
}
