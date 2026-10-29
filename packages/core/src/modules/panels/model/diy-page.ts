import type { DshHostContext, DshShell, DshToolRunContext } from '@dsh-workbench/shared';
import { BROWSER_SCREEN_SESSION } from '@dsh-workbench/shared/host';
import { DIY_DEBUG_SERVICE, sessionIdOf } from '@dsh-workbench/shared/host';
import type { DebugState, DebugStore } from '@dsh-workbench/shared/host';
import { boardFactOf, boardSituation, type BoardFactState, type BoardProbe, type BoardSituation } from '@dsh-workbench/shared/host';
import { cliCommandOf } from '@dsh-workbench/shared/host';
import { artifactsDirOf } from '@/shared/api/host/diy-artifacts';
import { hostSurface } from '@dsh-workbench/shared/host';
import { asRecord, asText, unitsOf, workspaceOf } from './diy-context';
import { readyPageOf, type WorkbenchPage } from './diy-browser';

export type BoardState = BoardFactState;

export interface PageHandle {
  readonly root: string;
  readonly artifactsDir: string;
  readonly unit: string;
  readonly args: Record<string, unknown>;
  readonly shell: DshShell;
  readonly command: string;
  readonly session: string;
  readonly bound: boolean;
  readonly board: BoardState;
  readonly boardPath: string;
}

export interface PageOptions {
  readonly requireWorkbench?: boolean | undefined;
  readonly requireUnit?: boolean | undefined;
  readonly requireBoard?: boolean | undefined;
  readonly requirePact?: boolean | undefined;
}

export function debugPausedText(held: DebugState): string {
  return (
    `调试已暂停（${held.unit}）—— 动作族关闸，不再拿屏当目标。` +
    '要接着看先 workbench_diy_debug_resume（会再要用户点头一次）；这之前可以改源码 / build / 跑门禁。'
  );
}

export function debugMissingPactText(): string {
  return (
    '现在没有调试约定 —— 看 / 动 / 网络 / 日志这一族只在约定里发得出去。' +
    '先 workbench_diy_debug_start（unit=…；会请用户点头一次，批了他会被告知「调试中请留在那一屏」），' +
    '再接着看；收工用 workbench_diy_debug_stop。'
  );
}

export function debugForeignPactText(held: DebugState): string {
  return (
    `另一场调试正占着那块屏（${held.sessionId} 在调试 ${held.unit}）—— ` +
    '一台机器同时只允许一场：让它先 workbench_diy_debug_stop，或等它收工。'
  );
}

export function debugOffBoardText(held: DebugState, situation: BoardSituation = 'other-board'): string {
  const where = held.title === '' ? '这一场调试所在的工作区' : `「${held.title}」`;
  const what =
    situation === 'off-workspace'
      ? `用户现在不在${where}（外壳选中的是别的工作区）`
      : situation === 'panel-closed'
        ? '工作台面板没画在屏上（右栏收着，或那一列让给了别的面板）'
        : `你现在这一页画的不是${where}那块板`;
  const next =
    situation === 'off-workspace'
      ? `让用户在左栏切回${where}`
      : situation === 'panel-closed'
        ? '让用户把「工作台面板」切回来（或把右栏展开）'
        : `让用户把那一页切回${where}`;
  return (
    `${what} —— 看 / 动 / 网络这一族现在发不出去，我不拿别的板当目标。` +
    `${held.unit} 这场调试仍然**进行中**（我没有自动替你落 paused）：${next}；` +
    '要停下来就自己 workbench_diy_debug_pause（不问审批），页面切回来了就接着看。'
  );
}

export function boardProbeOf(page: WorkbenchPage): BoardProbe {
  return {
    workbench: page.ok,
    where: page.where,
    bar: page.open !== null,
    board: page.board,
    open: page.open === true,
    drawn: page.shown,
  };
}

export function boardStateOf(page: WorkbenchPage, workshop: string | null): BoardState {
  return boardFactOf(boardProbeOf(page), workshop);
}

export function boardGateText(
  situation: BoardSituation,
  unit: string,
  page: WorkbenchPage,
  title = '',
): string {
  const where = title === '' ? '这一场调试所在的工作区' : `「${title}」`;
  if (situation === 'off-workspace') {
    return (
      `用户现在不在${where} —— 外壳选中的是 ${page.where || '(问不出来是哪一块)'}。` +
      `${where}那块板没在屏上，${unit} 的这张卡我看不到，也不拿别的板当目标。` +
      `让用户在左栏切回${where}；这之前我可以继续改源码 / build / 跑门禁。`
    );
  }
  if (situation === 'panel-closed') {
    return (
      '工作台面板没画在屏上（右栏收着，或者这一页让给了别的面板：文件预览、模块市场等）。' +
      `让用户把「工作台面板」切回来（或把右栏展开），我再接着看 ${unit}。`
    );
  }
  return (
    `你现在这一页画的是 ${page.board || '(不知道哪一块)'} 的面板，${where}那块板没在这一屏 —— ` +
    `${unit} 的这张卡不在屏上，我不拿别的板当目标。请用户在左栏切回${where}；` +
    '这之前我可以继续改源码 / build / 跑门禁。'
  );
}

export function desktopPageText(page?: WorkbenchPage): string {
  const bound =
    page === undefined || page.url === ''
      ? ''
      : `现在绑到的是 ${page.title || '(没有标题)'} ${page.url}。`;
  return (
    'Desktop 的屏调试不可用：工作台页在 Electron 窗口里（dsh-app://app/），运行时的浏览器扩展只能看 Chrome 标签 —— ' +
    '不带 read 的看 / 动 / 网络 / 日志没有可绑的目标（这不是扩展没连上：' +
    '扩展连上了，只是它看不到 Electron 窗口）。' +
    bound +
    '站点探索请用同一把工具的 read=<地址> 走后台只读线；录制（_record_*）照旧；' +
    '宿主侧的 diy_status / panel / list 也照旧。'
  );
}

export async function pageAt(
  ctx: DshHostContext,
  exec: DshToolRunContext,
  raw: unknown,
  options: PageOptions = {},
): Promise<PageHandle> {
  const { root, title } = await workspaceOf(ctx, exec);
  const args = asRecord(raw);
  const asked = asText(args['unit']);
  const { units } = unitsOf(ctx, root);
  const pool = units.map((one) => one.unit);
  const wanted = asked === '' && pool.length === 1 ? (pool[0] ?? '') : asked;
  if (wanted === '' && options.requireUnit !== false) {
    throw new Error(`看一眼要一个 unit（装过的：${pool.join(', ') || '（空）'}）`);
  }
  const shell = ctx.get<DshShell>('shell');
  if (shell === undefined) throw new Error('这台机器上没有 shell 服务，动不了浏览器');
  const store = ctx.get<DebugStore>(DIY_DEBUG_SERVICE);
  const held = store?.live(Date.now()) ?? null;
  const sessionId = sessionIdOf(exec);
  if (options.requirePact !== false) {
    if (held === null) throw new Error(debugMissingPactText());
    if (held.sessionId !== sessionId) throw new Error(debugForeignPactText(held));
    if (held.phase === 'paused') throw new Error(debugPausedText(held));
  }
  const command = cliCommandOf(ctx);
  const session = asText(args['session']) || BROWSER_SCREEN_SESSION;
  const handshake = await readyPageOf(shell, command, session);
  if (!handshake.ok && options.requireWorkbench !== false && !hostSurface().capabilities.pageDebug) {
    throw new Error(desktopPageText(handshake.page));
  }
  if (!handshake.ok && !handshake.bound) {
    throw new Error(
      `连不上浏览器：${handshake.reason}。` +
        `先让用户把工作台那一页切到前台（只有第一次要这样）；还不行就跑一次运行时自检（doctor）看扩展连没连上。`,
    );
  }
  if (!handshake.ok && options.requireWorkbench !== false) {
    const { page } = handshake;
    throw new Error(
      `你现在这一页不是工作台（${page.title || '(没有标题)'} ${page.url}）—— ` +
        `把工作台那一页切到前台，再喊我一次。我只看用户正在看的那一页。`,
    );
  }
  const board = boardStateOf(handshake.page, root);
  const situation = boardSituation(boardProbeOf(handshake.page), root);
  if (options.requirePact !== false && held !== null && (board === 'other' || board === 'hidden')) {
    throw new Error(debugOffBoardText(held, situation));
  }
  if (options.requireBoard !== false && (board === 'other' || board === 'hidden')) {
    throw new Error(boardGateText(situation, wanted, handshake.page, title));
  }
  return {
    root,
    artifactsDir: artifactsDirOf(ctx, root),
    unit: wanted,
    args,
    shell,
    command,
    session,
    bound: handshake.bound,
    board,
    boardPath: handshake.page.board,
  };
}
