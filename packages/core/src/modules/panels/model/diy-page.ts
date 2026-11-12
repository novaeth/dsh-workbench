import type { DshHostContext, DshToolRunContext } from '@dsh-workbench/shared';
import { BROWSER_SCREEN_SESSION, seamOf, type Seam } from '@dsh-workbench/shared/host';
import { DIY_DEBUG_SERVICE, sessionIdOf } from '@dsh-workbench/shared/host';
import type { DebugState, DebugStore } from '@dsh-workbench/shared/host';
import { boardFactOf, boardSituation, type BoardFactState, type BoardProbe, type BoardSituation } from '@dsh-workbench/shared/host';
import { cliCommandOf } from '@dsh-workbench/shared/host';
import { artifactsDirOf } from '@/shared/api/host/diy-artifacts';
import { hostSurface } from '@dsh-workbench/shared/host';
import { surfaceOf } from '@/shared/api/host/runtime-surface';
import { asRecord, asText, unitsOf, workspaceOf } from './diy-context';
import { readyPageOf, type LineMaker, type WorkbenchPage } from './diy-browser';

export type BoardState = BoardFactState;

export interface PageHandle {
  readonly root: string;
  readonly artifactsDir: string;
  readonly unit: string;
  readonly args: Record<string, unknown>;
  readonly seam: Seam;
  readonly command: string;
  readonly session: string;
  readonly line?: LineMaker;
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
    `调试已暂停（${held.unit}）。动作类工具已停用，不再以页面为目标。` +
    '要继续查看请先 workbench_diy_debug_resume，会再次请求用户批准。在此之前可以修改源码、执行 build 或运行门禁。'
  );
}

export function debugMissingPactText(): string {
  return (
    '当前没有调试约定。查看、操作、网络与日志类工具仅在约定内可用。' +
    '请先 workbench_diy_debug_start（unit=…；会请求用户批准一次，批准后用户会被告知「调试中请留在当前页面」），' +
    '再继续查看；结束时使用 workbench_diy_debug_stop。'
  );
}

export function debugForeignPactText(held: DebugState): string {
  return (
    `另一场调试正在占用该页面（${held.sessionId} 正在调试 ${held.unit}）。` +
    '一台机器同时只允许一场，请让它先 workbench_diy_debug_stop，或等待它结束。'
  );
}

export function debugOffBoardText(held: DebugState, situation: BoardSituation = 'other-board'): string {
  const where = held.title === '' ? '该场调试所在的工作区' : `「${held.title}」`;
  const what =
    situation === 'off-workspace'
      ? `用户当前不在${where}（外壳选中的是其他工作区）`
      : situation === 'panel-closed'
        ? '工作台面板未显示在页面上（右栏已收起，或该列已让给其他面板）'
        : `当前页面显示的不是${where}的面板`;
  const next =
    situation === 'off-workspace'
      ? `请让用户在左栏切回${where}`
      : situation === 'panel-closed'
        ? '请让用户把「工作台面板」切回，或展开右栏'
        : `请让用户把该页面切回${where}`;
  return (
    `${what}。查看、操作、网络类工具当前不可用，我不会以其他面板为目标。` +
    `${held.unit} 的调试仍处于**进行中**（我没有自动将它置为 paused）：${next}。` +
    '要停止请调用 workbench_diy_debug_pause（不询问审批）；页面切回后即可继续查看。'
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
  const where = title === '' ? '该场调试所在的工作区' : `「${title}」`;
  if (situation === 'off-workspace') {
    return (
      `用户当前不在${where}，外壳选中的是 ${page.where || '（无法确定）'}。` +
      `${where}的面板未显示在页面上，我看不到 ${unit} 的模块界面，也不会以其他面板为目标。` +
      `请让用户在左栏切回${where}；在此之前我可以继续修改源码、执行 build 或运行门禁。`
    );
  }
  if (situation === 'panel-closed') {
    return (
      '工作台面板未显示在页面上（右栏处于收起状态，或该页面已让给其他面板：文件预览、模块市场等）。' +
      `请让用户把「工作台面板」切回或展开右栏，我再继续查看 ${unit}。`
    );
  }
  return (
    `当前页面显示的是 ${page.board || '（无法确定）'} 的面板，${where}的面板不在当前页面。` +
    `我看不到 ${unit} 的模块界面，也不会以其他面板为目标。请用户在左栏切回${where}；` +
    '在此之前我可以继续修改源码、执行 build 或运行门禁。'
  );
}

export function desktopPageText(page?: WorkbenchPage): string {
  const bound =
    page === undefined || page.url === ''
      ? ''
      : `现在绑到的是 ${page.title || '(没有标题)'} ${page.url}。`;
  return (
    'Desktop 不支持页面调试：工作台页面位于 Electron 窗口（dsh-app://app/），运行时浏览器扩展只能查看 Chrome 标签。' +
    '因此不带 read 的查看、操作、网络与日志工具没有可绑定的目标。这不是扩展未连接：' +
    '扩展已连接，只是看不到 Electron 窗口。' +
    bound +
    '站点探索请使用同一工具的 read=<地址> 走后台只读线；录制（_record_*）与' +
    '宿主侧的 diy_status / panel / list 行为不变。'
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
    throw new Error(`查看需要一个 unit（已安装的：${pool.join(', ') || '（空）'}）`);
  }
  const seam = seamOf(ctx);
  if (seam === undefined) throw new Error('这台机器上没有 shell 服务，无法操作浏览器');
  const store = ctx.get(DIY_DEBUG_SERVICE) as DebugStore | undefined;
  const held = store?.live(Date.now()) ?? null;
  const sessionId = sessionIdOf(exec);
  if (options.requirePact !== false) {
    if (held === null) throw new Error(debugMissingPactText());
    if (held.sessionId !== sessionId) throw new Error(debugForeignPactText(held));
    if (held.phase === 'paused') throw new Error(debugPausedText(held));
  }
  const command = cliCommandOf(ctx);
  const session = asText(args['session']) || BROWSER_SCREEN_SESSION;
  const handshake = await readyPageOf(seam, command, session);
  if (!handshake.ok && options.requireWorkbench !== false && !hostSurface().capabilities.pageDebug) {
    throw new Error(desktopPageText(handshake.page));
  }
  if (!handshake.ok && !handshake.bound) {
    throw new Error(
      `无法连接浏览器：${handshake.reason}。` +
        `请先让用户把工作台页面切到前台（仅第一次需要）；若仍失败，请运行一次运行时自检（doctor），确认扩展已连接。`,
    );
  }
  if (!handshake.ok && options.requireWorkbench !== false) {
    const { page } = handshake;
    throw new Error(
      `当前页面不是工作台（${page.title || '(没有标题)'} ${page.url}）。` +
        `请把工作台页面切到前台后再调用我；我只查看用户当前正在查看的页面。`,
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
    artifactsDir: artifactsDirOf(root),
    unit: wanted,
    args,
    seam,
    command,
    session,
    ...(surfaceOf(ctx)?.background === undefined ? {} : { line: surfaceOf(ctx)?.background }),
    bound: handshake.bound,
    board,
    boardPath: handshake.page.board,
  };
}
