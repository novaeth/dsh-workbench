import type {
  DshHostContext,
  DshShell,
  DshToolDefinition,
  DshToolRegistry,
  DshToolRunContext,
} from '@dsh-workbench/shared';
import { BROWSER_READ_SESSION } from '@dsh-workbench/shared/host';
import { dirname, join } from 'node:path';
import { cliCommandOf } from '@dsh-workbench/shared/host';
import { cropPngFile, type PngRect } from '@/shared/api/host/png-crop';
import { asNumber, asRecord, asText, OUTPUT, plainJson } from './diy-context';
import { surfaceOf } from '@/shared/api/host/runtime-surface';
import { jsonOf, LOOK_TIMEOUT_MS, runBrowserStep } from './diy-browser';
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

export interface PngClip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

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

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function clipOf(value: unknown): PngClip | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const x = finite(raw['x']);
  const y = finite(raw['y']);
  const width = finite(raw['width']);
  const height = finite(raw['height']);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return undefined;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

export function deviceClipRect(clip: PngClip, dpr: number): PngRect {
  const scale = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return {
    x: Math.max(0, Math.round(clip.x * scale)),
    y: Math.max(0, Math.round(clip.y * scale)),
    width: Math.max(1, Math.round(clip.width * scale)),
    height: Math.max(1, Math.round(clip.height * scale)),
  };
}

export function clipNote(clip: PngClip, viewport: { readonly width: number; readonly height: number }): string {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return '没读到视口尺寸（那条量 dpr / innerWidth 的 eval 没回来）—— 给的是整屏图，裁不了';
  }
  const inside =
    clip.x + clip.width <= viewport.width && clip.y + clip.height <= viewport.height && viewport.width > 0;
  if (inside) return '';
  return (
    `要裁的那块 ${String(clip.x)},${String(clip.y)} ${String(clip.width)}×${String(clip.height)} 不在视口里` +
    `（视口 ${String(viewport.width)}×${String(viewport.height)}）—— 给的是整屏图`
  );
}

export function defaultShotPath(dir: string, unit: string, stamp: number): string {
  return join(dir, `${unit === '' ? 'page' : unit}-${String(stamp)}.png`);
}

export const BROWSER_TOOLS: readonly BrowserToolRow[] = [
  {
    tool: DIY_STATE_TOOL,
    verb: ['state'],
    description: '这一页有什么：URL / 标题 / 可点的元素与索引。',
    argsHelp: '`{cmd}` state 的参数（如 --source ax）。',
  },
  {
    tool: DIY_HTML_TOOL,
    verb: ['get', 'html'],
    description: '取 DOM：默认整页 HTML，--as json 给 {tag,attrs,text,children} 树。',
    argsHelp: '`{cmd}` get html 的参数（--selector / --as json / --depth / --children-max / --text-max）。',
    css: { kind: 'flag', flag: '--selector' },
  },
  {
    tool: DIY_FIND_TOOL,
    verb: ['find'],
    description: '按 CSS 或语义找元素，回 {matches_n, entries[]}（ref 只在那一次快照里有效）。',
    argsHelp: '`{cmd}` find 的参数（--css / --role / --name / --testid / --limit / --text-max）。',
    css: { kind: 'flag', flag: '--css' },
  },
  {
    tool: DIY_CLICK_TOOL,
    verb: ['click'],
    description: '点一个元素。',
    argsHelp: '`{cmd}` click 的参数（选择器 / --role / --name / --nth）。',
    css: { kind: 'positional', at: 0 },
  },
  {
    tool: DIY_HOVER_TOOL,
    verb: ['hover'],
    description: '把鼠标移到元素上。',
    argsHelp: '`{cmd}` hover 的参数（选择器 / --role / --name）。',
    css: { kind: 'positional', at: 0 },
  },
  {
    tool: DIY_TYPE_TOOL,
    verb: ['type'],
    description: '点一下再敲字。',
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
    description: '给焦点发按键。',
    argsHelp: '`{cmd}` keys 的参数（如 Enter / Meta+K）。',
  },
  {
    tool: DIY_SCROLL_TOOL,
    verb: ['scroll'],
    description: '滚一屏。',
    argsHelp: '`{cmd}` scroll 的参数（up|down / --amount）。',
  },
  {
    tool: DIY_WAIT_TOOL,
    verb: ['wait'],
    description: '等一件事：选择器 / 文字 / 时间 / XHR / 下载。',
    argsHelp: '`{cmd}` wait 的参数（selector|text|time|xhr|download + --timeout）。',
    css: { kind: 'positional', at: 1, onlyWhenFirst: 'selector' },
  },
  {
    tool: DIY_EVAL_TOOL,
    verb: ['eval'],
    description: '在页面里跑一段 JS（return 什么就回什么）。',
    argsHelp: '`{cmd}` eval 的参数：一段 JS（in=card 时可用注入的 root）。',
    evalInCard: true,
  },
  {
    tool: DIY_SCREENSHOT_TOOL,
    verb: ['screenshot'],
    description: '拍一张图（写文件；clip 给 CSS px 就只裁那一块）。',
    argsHelp: '`{cmd}` screenshot 的参数：文件路径在前，然后 --full-page / --width / --height / --annotate。',
    clip: true,
  },
  {
    tool: DIY_NETWORK_TOOL,
    verb: ['network'],
    description: '看网络：捕获到的请求形状（URL / 方法 / key）；body 取不到，要 body 用 _eval 里 fetch 打一条。',
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
      description: '只读线：给站点地址；Desktop 用这条。',
    },
  };
  if (row.css !== undefined) {
    properties['scope'] = {
      type: 'string',
      enum: ['page', 'card'],
      description: 'card = 把 CSS 目标收进这张卡；默认 page（原样转发）。',
    };
  }
  if (row.evalInCard === true) {
    properties['in'] = {
      type: 'string',
      enum: ['page', 'card'],
      description: 'card = 脚本在卡根里跑（注入 root；脚本自己 return）。',
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
      description: '只要这一块：拍完本地裁；不在视口里就退回整屏图。',
    };
  }
  return { type: 'object', properties, additionalProperties: false };
}

async function viewportOf(page: PageHandle): Promise<{ dpr: number; width: number; height: number }> {
  const step = await runBrowserStep(
    page.shell,
    page.command,
    ['browser', page.session, 'eval', VIEWPORT_SCRIPT, '--window', 'background'],
    LOOK_TIMEOUT_MS,
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

async function onSiteOnce(shell: DshShell, command: string, site: string): Promise<boolean> {
  const step = await runBrowserStep(
    shell,
    command,
    ['browser', BROWSER_READ_SESSION, 'get', 'url', '--window', 'background'],
    LOOK_TIMEOUT_MS,
  );
  const want = hostOf(site);
  if (want === '' || hostOf(step.stdout.trim()) === want) return false;
  await runBrowserStep(
    shell,
    command,
    ['browser', BROWSER_READ_SESSION, 'open', site, '--window', 'background'],
    LOOK_TIMEOUT_MS,
  );
  return true;
}

function loginHintOf(stdout: string, site: string): string {
  const code = jsonOf(stdout)?.['code'];
  if (code === 'not-logged-in') {
    return `没登录：去 ${site} 登一次再重跑（读线的约定：脚本回 { ok: false, code: "not-logged-in" }）。`;
  }
  if (code === 'not-on-site') {
    return `还不在 ${site} 上：我开过一次了 —— 让用户在那扇窗里切过去登一次，再重跑。`;
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
    return '只读线上没有「用户那张卡」：unit / scope=card / in=card / $card 只在屏那一档能用。';
  }
  return row.clip === true ? '只读线不截图裁剪 —— clip 是屏那一档的事（要图走 _screenshot）。' : '';
}

async function runReadTool(
  row: BrowserToolRow,
  ctx: DshHostContext,
  raw: Record<string, unknown>,
  site: string,
): Promise<Record<string, unknown>> {
  const refused = readRefusalOf(row, raw);
  if (refused !== '') throw new Error(refused);
  const shell = ctx.get<DshShell>('shell');
  if (shell === undefined) throw new Error('这台机器上没有 shell 服务，驱动不了浏览器');
  const command = cliCommandOf(ctx);
  const requested = asNumber(raw['timeoutMs']);
  const timeoutMs = requested !== undefined && requested > 0 ? requested : DEFAULT_TIMEOUT_MS;
  const argv = stringsOf(raw['args']);
  const opened = await onSiteOnce(shell, command, site);
  const step = await runBrowserStep(
    shell,
    command,
    ['browser', BROWSER_READ_SESSION, ...row.verb, ...argv, '--window', 'background'],
    timeoutMs,
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
      '要卡作用域（scope=card / $card / in=card）就得给一个 unit —— 这个工作区里不止一个模块时，我不知道你说哪一张卡。',
    );
  }
  const requested = asNumber(page.args['timeoutMs']);
  const timeoutMs = requested !== undefined && requested > 0 ? requested : DEFAULT_TIMEOUT_MS;
  const argv = argvOf(row, page.args, page.unit);
  const clip = row.clip === true ? clipOf(page.args['clip']) : undefined;
  const clipAsked = row.clip === true && page.args['clip'] !== undefined;
  let file = '';
  let finalArgv = argv;
  if (row.clip === true) {
    const given = argv[0] !== undefined && !argv[0].startsWith('-') ? argv[0] : '';
    if (given === '') {
      file = defaultShotPath(page.artifactsDir, page.unit, Date.now());
      finalArgv = [file, ...argv];
      ensureDirOf(dirname(file));
    } else {
      file = given;
    }
  }
  const step = await runBrowserStep(
    page.shell,
    page.command,
    ['browser', page.session, ...row.verb, ...finalArgv, '--window', 'background'],
    timeoutMs,
  );
  const shot: Record<string, unknown> = {};
  if (row.clip === true) {
    shot['file'] = step.ok ? file : '';
    if (clipAsked && clip === undefined) {
      shot['cropped'] = false;
      shot['cropReason'] = 'clip 不是完整矩形（要 x/y ≥ 0，width/height > 0）—— 给的是整屏图';
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
