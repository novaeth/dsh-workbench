import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import {
  BROWSER_READ_SESSION,
  pathsWrite,
  productWrite,
  seamOf,
  type Seam,
  type WriteIntent,
} from '@dsh-workbench/shared/host';
import { dirname } from 'node:path';
import { cliCommandOf } from '@dsh-workbench/shared/host';
import { cropPngFile } from '@/shared/api/host/png-crop';
import { asNumber, asRecord, asText, OUTPUT, plainJson } from './diy-context';
import { surfaceOf } from '@/shared/api/host/runtime-surface';
import { jsonOf, LOOK_TIMEOUT_MS, runBrowserStep, type LineMaker } from './diy-browser';
import { clipNote, clipOf, defaultShotPath, deviceClipRect } from './diy-browser-clip';
import { ensureDirOf } from '@/shared/api/host/diy-artifacts';
import { pageAt, type PageHandle } from './diy-page';
import { UNIT_PROP } from './diy-schema';
import { cardSelectorOf } from './diy-scripts';
import {
  DIY_CLICK_TOOL,
  DIY_DIALOG_TOOL,
  DIY_EVAL_TOOL,
  DIY_FILL_TOOL,
  DIY_FIND_TOOL,
  DIY_HOVER_TOOL,
  DIY_HTML_TOOL,
  DIY_KEYS_TOOL,
  DIY_NETWORK_TOOL,
  DIY_SCREENSHOT_TOOL,
  DIY_SCROLL_TOOL,
  DIY_STATE_TOOL,
  DIY_TYPE_TOOL,
  DIY_WAIT_TOOL,
  type PanelsToolName,
} from '../unit';

const DEFAULT_TIMEOUT_MS = 30000;
const CARD_TAIL = ' .wb-card';
const VIEWPORT_SCRIPT = '({ dpr: window.devicePixelRatio, width: window.innerWidth, height: window.innerHeight })';

export const CARD_TOKEN = '$card';

export type CssTarget =
  | { readonly kind: 'positional'; readonly at: number; readonly onlyWhenFirst?: string | undefined }
  | { readonly kind: 'flag'; readonly flag: string };

export interface BrowserToolRow {
  readonly tool: PanelsToolName;
  readonly verb: readonly string[];
  readonly description: string;
  readonly argsHelp: string;
  readonly css?: CssTarget | undefined;
  readonly evalInCard?: boolean | undefined;
  readonly clip?: boolean | undefined;
}

export function cardSelectorIn(unit: string): string {
  return `${cardSelectorOf(unit)}${CARD_TAIL}`;
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((one) => asText(one)).filter((one) => one !== '');
}

function withToken(argv: readonly string[], card: string): string[] {
  return argv.map((one) => one.split(CARD_TOKEN).join(card));
}

function prefixValue(argv: readonly string[], flag: string, card: string): string[] {
  const at = argv.indexOf(flag);
  if (at !== -1) {
    const value = argv[at + 1];
    if (value === undefined || value.startsWith('-')) return [...argv.slice(0, at + 1), card, ...argv.slice(at + 1)];
    return [...argv.slice(0, at + 1), `${card} ${value}`, ...argv.slice(at + 2)];
  }
  const joined = `${flag}=`;
  const eq = argv.findIndex((one) => one.startsWith(joined));
  if (eq !== -1) {
    return argv.map((one, index) => (index === eq ? `${joined}${card} ${one.slice(joined.length)}` : one));
  }
  return [...argv, flag, card];
}

function prefixPositional(argv: readonly string[], at: number, card: string, onlyWhenFirst?: string): string[] {
  if (onlyWhenFirst !== undefined && argv[0] !== onlyWhenFirst) return [...argv];
  const value = argv[at];
  if (value === undefined || value.startsWith('-')) return [...argv];
  return [...argv.slice(0, at), `${card} ${value}`, ...argv.slice(at + 1)];
}

export function evalWrapped(script: string, card: string): string {
  return `(() => { const root = document.querySelector(${JSON.stringify(card)}); if (root === null) return null;\n${script}\n})()`;
}

function wrapFirst(argv: readonly string[], card: string): string[] {
  const first = argv[0];
  if (first === undefined || first.startsWith('-')) return [...argv];
  return [evalWrapped(first, card), ...argv.slice(1)];
}

export function argvOf(row: BrowserToolRow, raw: Record<string, unknown>, unit: string): string[] {
  const card = cardSelectorIn(unit);
  const declared = stringsOf(raw['args']);
  const script = row.evalInCard === true && asText(raw['in']) === 'card' ? wrapFirst(declared, card) : declared;
  const tokens = withToken(script, card);
  if (row.css === undefined || asText(raw['scope']) !== 'card') return tokens;
  if (row.css.kind === 'flag') return prefixValue(tokens, row.css.flag, card);
  return prefixPositional(tokens, row.css.at, card, row.css.onlyWhenFirst);
}

export const BROWSER_TOOLS: readonly BrowserToolRow[] = [
  {
    tool: DIY_STATE_TOOL,
    verb: ['state'],
    description: '查看当前页面：URL / 标题 / 可点击元素及其索引。',
    argsHelp: '`{cmd}` state 的参数（如 --source ax）。',
  },
  {
    tool: DIY_HTML_TOOL,
    verb: ['get', 'html'],
    description: '获取 DOM：默认整页 HTML；--as json 返回元素树。',
    argsHelp: '`{cmd}` get html 的参数（--selector / --as json / --depth / --children-max / --text-max）。',
    css: { kind: 'flag', flag: '--selector' },
  },
  {
    tool: DIY_FIND_TOOL,
    verb: ['find'],
    description: '按 CSS 或语义查找元素，返回 {matches_n, entries[]}（ref 仅当次快照有效）。',
    argsHelp: '`{cmd}` find 的参数（--css / --role / --name / --testid / --limit / --text-max）。',
    css: { kind: 'flag', flag: '--css' },
  },
  {
    tool: DIY_CLICK_TOOL,
    verb: ['click'],
    description: '点击一个元素。',
    argsHelp: '`{cmd}` click 的参数（选择器 / --role / --name / --nth）。',
    css: { kind: 'positional', at: 0 },
  },
  {
    tool: DIY_HOVER_TOOL,
    verb: ['hover'],
    description: '将鼠标移到元素上。',
    argsHelp: '`{cmd}` hover 的参数（选择器 / --role / --name）。',
    css: { kind: 'positional', at: 0 },
  },
  {
    tool: DIY_TYPE_TOOL,
    verb: ['type'],
    description: '选中元素后输入文字。',
    argsHelp: '`{cmd}` type 的参数（选择器在前，然后是字）。',
    css: { kind: 'positional', at: 0 },
  },
  {
    tool: DIY_FILL_TOOL,
    verb: ['fill'],
    description: '直接把值设进去。',
    argsHelp: '`{cmd}` fill 的参数（选择器在前，然后是值）。',
    css: { kind: 'positional', at: 0 },
  },
  {
    tool: DIY_KEYS_TOOL,
    verb: ['keys'],
    description: '向焦点元素发送按键。',
    argsHelp: '`{cmd}` keys 的参数（如 Enter / Meta+K）。',
  },
  {
    tool: DIY_SCROLL_TOOL,
    verb: ['scroll'],
    description: '滚动一屏。',
    argsHelp: '`{cmd}` scroll 的参数（up|down / --amount）。',
  },
  {
    tool: DIY_WAIT_TOOL,
    verb: ['wait'],
    description: '等待某个条件：选择器 / 文字 / 时间 / XHR / 下载。',
    argsHelp: '`{cmd}` wait 的参数（selector|text|time|xhr|download + --timeout）。',
    css: { kind: 'positional', at: 1, onlyWhenFirst: 'selector' },
  },
  {
    tool: DIY_EVAL_TOOL,
    verb: ['eval'],
    description: '在页面中执行一段 JS（return 什么就返回什么）。',
    argsHelp: '`{cmd}` eval 的参数：一段 JS（in=card 时可用注入的 root）。',
    evalInCard: true,
  },
  {
    tool: DIY_SCREENSHOT_TOOL,
    verb: ['screenshot'],
    description: '截取一张图片（写入文件；clip 传入 CSS px 时只裁剪该区域）。',
    argsHelp: '`{cmd}` screenshot 的参数：文件路径在前，然后 --full-page / --width / --height / --annotate。',
    clip: true,
  },
  {
    tool: DIY_NETWORK_TOOL,
    verb: ['network'],
    description: '查看网络：捕获的请求结构（URL / 方法 / key）。无法获取 body；需要时用 _eval 中的 fetch 发送请求。',
    argsHelp: '`{cmd}` network 的参数（--since / --until / --detail / --filter / --all / --raw / --follow）。',
  },
  {
    tool: DIY_DIALOG_TOOL,
    verb: ['dialog'],
    description: '处理 JS 弹窗。',
    argsHelp: '`{cmd}` dialog 的参数（accept | dismiss）。',
  },
];

function parametersOf(row: BrowserToolRow, command: string): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    unit: UNIT_PROP,
    args: { type: 'array', items: { type: 'string' }, description: row.argsHelp.replace('{cmd}', command) },
    timeoutMs: { type: 'number', description: '超时毫秒（默认 30000）。' },
    read: {
      type: 'string',
      description: '只读线：提供站点地址；Desktop 使用此项。',
    },
  };
  if (row.css !== undefined) {
    properties['scope'] = {
      type: 'string',
      enum: ['page', 'card'],
      description: 'card = 把 CSS 目标限定在该模块界面内；默认 page（原样转发）。',
    };
  }
  if (row.evalInCard === true) {
    properties['in'] = {
      type: 'string',
      enum: ['page', 'card'],
      description: 'card = 脚本在模块根节点中执行（注入 root，脚本自行 return）。',
    };
  }
  if (row.clip === true) {
    properties['clip'] = {
      type: 'object',
      properties: {
        x: { type: 'number', description: '左边（CSS px）。' },
        y: { type: 'number', description: '上边（CSS px）。' },
        width: { type: 'number', description: '宽（CSS px）。' },
        height: { type: 'number', description: '高（CSS px）。' },
      },
      required: ['x', 'y', 'width', 'height'],
      additionalProperties: false,
      description: '只截取该区域：截图后本地裁剪；区域不在视口内时退回整屏截图。',
    };
  }
  return { type: 'object', properties, additionalProperties: false };
}

async function viewportOf(page: PageHandle): Promise<{ dpr: number; width: number; height: number }> {
  const step = await runBrowserStep(
    page.seam,
    page.command,
    ['browser', page.session, 'eval', VIEWPORT_SCRIPT, '--window', 'background'],
    LOOK_TIMEOUT_MS,
    page.line,
  );
  const parsed = jsonOf(step.stdout);
  return {
    dpr: asNumber(parsed?.['dpr']) ?? 1,
    width: asNumber(parsed?.['width']) ?? 0,
    height: asNumber(parsed?.['height']) ?? 0,
  };
}

function needsCardOf(row: BrowserToolRow, raw: Record<string, unknown>): boolean {
  if (row.evalInCard === true && asText(raw['in']) === 'card') return true;
  if (row.css !== undefined && asText(raw['scope']) === 'card') return true;
  return stringsOf(raw['args']).some((one) => one.includes(CARD_TOKEN));
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

async function onSiteOnce(seam: Seam, command: string, site: string, line?: LineMaker): Promise<boolean> {
  const step = await runBrowserStep(
    seam,
    command,
    ['browser', BROWSER_READ_SESSION, 'get', 'url', '--window', 'background'],
    LOOK_TIMEOUT_MS,
    line,
  );
  const want = hostOf(site);
  if (want === '' || hostOf(step.stdout.trim()) === want) return false;
  await runBrowserStep(
    seam,
    command,
    ['browser', BROWSER_READ_SESSION, 'open', site, '--window', 'background'],
    LOOK_TIMEOUT_MS,
    line,
  );
  return true;
}

function loginHintOf(stdout: string, site: string): string {
  const code = jsonOf(stdout)?.['code'];
  if (code === 'not-logged-in') {
    return `未登录：请先在 ${site} 登录，再重新运行（读线约定：脚本返回 { ok: false, code: "not-logged-in" }）。`;
  }
  if (code === 'not-on-site') {
    return `当前不在 ${site}：我已打开过页面。请用户在该窗口中切换并登录，然后重新运行。`;
  }
  return '';
}

function readRefusalOf(row: BrowserToolRow, raw: Record<string, unknown>): string {
  const cardAsked =
    asText(raw['unit']) !== '' ||
    asText(raw['scope']) === 'card' ||
    asText(raw['in']) === 'card' ||
    stringsOf(raw['args']).some((one) => one.includes(CARD_TOKEN));
  if (cardAsked) {
    return '只读线没有「用户模块界面」：unit、scope=card、in=card 与 $card 仅在页面调试模式下可用。';
  }
  return row.clip === true ? '只读线不支持截图裁剪：clip 仅在页面调试模式下可用（需要图片请使用 _screenshot）。' : '';
}

async function runReadTool(
  row: BrowserToolRow,
  ctx: DshHostContext,
  raw: Record<string, unknown>,
  site: string,
): Promise<Record<string, unknown>> {
  const refused = readRefusalOf(row, raw);
  if (refused !== '') throw new Error(refused);
  const seam = seamOf(ctx);
  if (seam === undefined) throw new Error('这台机器上没有 shell 服务，无法驱动浏览器');
  const command = cliCommandOf(ctx);
  const requested = asNumber(raw['timeoutMs']);
  const timeoutMs = requested !== undefined && requested > 0 ? requested : DEFAULT_TIMEOUT_MS;
  const argv = stringsOf(raw['args']);
  const line = surfaceOf(ctx)?.background;
  const opened = await onSiteOnce(seam, command, site, line);
  const step = await runBrowserStep(
    seam,
    command,
    ['browser', BROWSER_READ_SESSION, ...row.verb, ...argv, '--window', 'background'],
    timeoutMs,
    line,
  );
  const hint = row.tool === DIY_EVAL_TOOL ? loginHintOf(step.stdout, site) : '';
  return {
    session: BROWSER_READ_SESSION,
    verb: row.verb.join(' '),
    argv,
    opened,
    ok: step.ok,
    exitCode: step.exitCode,
    timedOut: step.timedOut,
    truncated: step.truncated,
    stdout: hint === '' ? step.stdout : `${step.stdout}\n${hint}`,
    stderr: step.stderr,
  };
}

async function runBrowserTool(
  row: BrowserToolRow,
  ctx: DshHostContext,
  raw: unknown,
  exec: DshToolRunContext,
): Promise<Record<string, unknown>> {
  const args = asRecord(raw);
  const read = asText(args['read']);
  if (read !== '') return runReadTool(row, ctx, args, read);
  const page = await pageAt(ctx, exec, raw, { requireUnit: false });
  if (needsCardOf(row, page.args) && page.unit === '') {
    throw new Error(
      '使用模块作用域（scope=card / $card / in=card）时必须提供 unit。当前工作区有多个模块，无法确定指哪一个模块界面。',
    );
  }
  const requested = asNumber(page.args['timeoutMs']);
  const timeoutMs = requested !== undefined && requested > 0 ? requested : DEFAULT_TIMEOUT_MS;
  const argv = argvOf(row, page.args, page.unit);
  const clip = row.clip === true ? clipOf(page.args['clip']) : undefined;
  const clipAsked = row.clip === true && page.args['clip'] !== undefined;
  let file = '';
  let finalArgv = argv;
  let intent: WriteIntent = productWrite();
  if (row.clip === true) {
    const given = argv[0] !== undefined && !argv[0].startsWith('-') ? argv[0] : '';
    if (given === '') {
      file = defaultShotPath(page.artifactsDir, page.unit, Date.now());
      finalArgv = [file, ...argv];
      ensureDirOf(dirname(file));
    } else {
      file = given;
      intent = pathsWrite([file]);
    }
  }
  const step = await runBrowserStep(
    page.seam,
    page.command,
    ['browser', page.session, ...row.verb, ...finalArgv, '--window', 'background'],
    timeoutMs,
    page.line,
    intent,
  );
  const shot: Record<string, unknown> = {};
  if (row.clip === true) {
    shot['file'] = step.ok ? file : '';
    if (clipAsked && clip === undefined) {
      shot['cropped'] = false;
      shot['cropReason'] = 'clip 不是完整矩形（需 x/y ≥ 0、width/height > 0），已返回整屏图。';
    } else if (clip !== undefined && step.ok) {
      const viewport = await viewportOf(page);
      const note = clipNote(clip, viewport);
      if (note === '') {
        const crop = cropPngFile(file, file, deviceClipRect(clip, viewport.dpr));
        shot['cropped'] = crop.ok;
        shot['cropReason'] = crop.reason;
      } else {
        shot['cropped'] = false;
        shot['cropReason'] = note;
      }
    }
  }
  return {
    workspace: page.root,
    unit: page.unit,
    verb: row.verb.join(' '),
    argv: finalArgv,
    ok: step.ok,
    exitCode: step.exitCode,
    timedOut: step.timedOut,
    truncated: step.truncated,
    stdout: step.stdout,
    stderr: step.stderr,
    ...shot,
  };
}

export function registerBrowserTools(ctx: DshHostContext, tools: DshToolRegistry): readonly (() => void)[] {
  const surface = surfaceOf(ctx);
  const commandOf = (row: BrowserToolRow): string => surface?.browser?.(row.verb) ?? `browser ${row.verb.join(' ')}`;
  return BROWSER_TOOLS.map((row) => {
    const definition: DshToolDefinition = {
      name: row.tool,
      description: row.description,
      parameters: parametersOf(row, commandOf(row)),
      output: OUTPUT,
      execute: async (raw: unknown, exec: DshToolRunContext) => plainJson(await runBrowserTool(row, ctx, raw, exec)),
    };
    return tools.register(definition);
  });
}

export { clipNote, clipOf, defaultShotPath, deviceClipRect, type PngClip } from './diy-browser-clip';
