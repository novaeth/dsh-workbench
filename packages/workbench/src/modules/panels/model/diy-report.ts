import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
import type { PanelUnitReport } from '@dsh-workbench/shared/host';

import { moduleBuildFacts } from '@/shared/api/host/diy-facts';
import {
  shapeOf,
  syncStateOf,
  toolchainOf,
  type DiyModule,
  type SyncState,
  type Toolchain,
  type WorkspaceShape,
} from '@/shared/api/host/diy-modules';
import { runningVersionOf } from '@/shared/api/host/self-update';

export const SYNC_STALE_MINUTES = 15;

export const SYNC_STALE_MS = SYNC_STALE_MINUTES * 60_000;

function fixText(): string {
  return '   修法：cd "$DSH_HOME/workbench/diy" && pnpm install；还不行就把这个工坊目录删掉再重启一次工作台（骨架会自己重建；`packages/` 下你造的模块先留着或另存）。';
}

function syncingStillRunning(at: string, now: number, windowMs: number): boolean {
  const started = dayjs(at).valueOf();
  if (!Number.isFinite(started)) return true;
  return now - started <= windowMs;
}

function toolchainGap(toolchain: Toolchain | undefined, shellVersion: string): string | undefined {
  if (toolchain === undefined) return undefined;
  const parts: readonly (readonly [string, string])[] = [
    ['core', toolchain.core],
    ['module-tools', toolchain.moduleTools],
    ['shared', toolchain.shared],
  ];
  const gaps = parts.filter((one) => one[1] !== shellVersion);
  return gaps.length === 0 ? undefined : gaps.map((one) => `${one[0]} ${one[1]}`).join(' / ');
}

export function syncNotice(input: {
  readonly sync: SyncState | undefined;
  readonly shellVersion: string | undefined;
  readonly toolchain: Toolchain | undefined;
  readonly now?: number;
  readonly windowMs?: number;
}): string | undefined {
  const { sync, shellVersion, toolchain } = input;
  const now = input.now ?? Date.now();
  const windowMs = input.windowMs ?? SYNC_STALE_MS;
  if (shellVersion === undefined) return undefined;
  const gap = toolchainGap(toolchain, shellVersion);
  if (toolchain !== undefined && gap === undefined) return undefined;
  const about = sync !== undefined && sync.version === shellVersion ? sync : undefined;
  if (about === undefined && gap === undefined) return undefined;
  const where = gap === undefined ? '工坊里读不到那三个包的版本' : `工坊里 ${gap}`;
  if (about !== undefined && about.state === 'failed') {
    return [
      `⚠️ 工坊工具链还是上一代（${where}；外壳已经是 ${shellVersion}）：${about.reason ?? '(没给原因)'}`,
      fixText(),
    ].join('\n');
  }
  if (about !== undefined && about.state === 'syncing') {
    if (syncingStillRunning(about.at, now, windowMs)) {
      return `⏳ 工坊工具链正在后台同步到 ${shellVersion} —— 这段期间按上一代在跑，不用等它。`;
    }
    return [
      `⚠️ 工坊工具链上一次同步没走完（这条停在 ${about.at}，超过 ${String(Math.round(windowMs / 60_000))} 分钟了）：` +
        `${where}，外壳已经是 ${shellVersion}。`,
      fixText(),
    ].join('\n');
  }
  if (gap === undefined) return undefined;
  return (
    `⏳ 工坊工具链还是上一代（工坊里 ${gap}，外壳 ${shellVersion}）—— ` +
    `下一轮工作台启动时会对齐到 ${shellVersion}；一直这样就看 $DSH_HOME/workbench/seed.log。`
  );
}

export interface SuiteHealth {
  readonly state: 'ok' | 'failed' | 'absent';
  readonly reason?: string;
}

export interface RegistryLike {
  all(): readonly { readonly unit: string }[];
  refusals(): readonly { readonly unit: string; readonly reasons: readonly string[] }[];
  failureOf(unit: string): string | undefined;
}

export function healthOf(options: {
  readonly registry: RegistryLike | undefined;
  readonly unit: string;
  readonly installed: boolean;
}): SuiteHealth {
  const { registry, unit, installed } = options;
  const refused = registry?.refusals().find((one) => one.unit === unit);
  if (refused !== undefined) return { state: 'failed', reason: refused.reasons.join('；') };
  const failed = registry?.failureOf(unit);
  if (failed !== undefined) return { state: 'failed', reason: failed };
  if (registry?.all().some((one) => one.unit === unit) === true) return { state: 'ok' };
  return {
    state: 'absent',
    reason: installed ? '工作台还没读到它的声明 —— 新装的模块要重启一次工作台' : '还没装',
  };
}

function healthText(health: SuiteHealth): string {
  if (health.state === 'ok') return '是';
  if (health.state === 'failed') return `不是 —— ${health.reason ?? '(没给原因)'}`;
  return `还没有（${health.reason ?? '还不知道'}）`;
}

export function ageText(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 10) return '刚刚';
  if (seconds < 60) return `${String(seconds)} 秒前`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} 分钟前`;
  return `${String(Math.round(minutes / 60))} 小时前`;
}

export function stampOf(at: number): string {
  return `${dayjs(at).utc().format('HH:mm:ss')}Z`;
}

export function readText(read: PanelUnitReport['cards'][number], now: number): string {
  const when = `${stampOf(read.at)} · ${ageText(read.at, now)}`;
  if (read.phase === 'ready') return `${read.route} 读到了（${when}）`;
  if (read.phase === 'loading') return `${read.route} 正在读（${when}）`;
  if (read.phase === 'idle') return `${read.route} 没在取数（${when}）`;
  const code = read.error?.code ?? 'unknown';
  const message = read.error?.message ?? '';
  return `${read.route} 读不到（${code}）${message === '' ? '' : `：${message}`}（${when}）`;
}

export function renderPanel(options: {
  readonly root: string;
  readonly rows: readonly {
    readonly unit: string;
    readonly name: string;
    readonly health: SuiteHealth;
    readonly report?: PanelUnitReport;
  }[];
  readonly board: readonly string[];
  readonly at: number;
  readonly now: number;
}): string {
  const { root, rows, board, at, now } = options;
  const head = `工作区：${root}`;
  const note =
    at === 0
      ? '\n还没有一条面板运行态上报 —— 面板上一个取数 / 渲染都没发生过：' +
        '要么这个工作区的面板上没开卡片，要么用户那一页还是刷新前的旧版本（上报要页面刷一次才带上）。'
      : `\n面板上有 ${String(board.length)} 张卡｜运行态来自用户那一页（最后一次上报 ${stampOf(at)} · ${ageText(at, now)}）`;
  const body = rows.map((row) => {
    const title = `—— ${row.unit}${row.name === '' ? '' : `（${row.name}）`} · ${healthText(row.health)}`;
    const report = row.report;
    if (report === undefined) {
      return [title, `   没上报：卡片没渲染出来，或者用户那一页还没刷新到带这份补丁的版本`].join('\n');
    }
    const reads = report.cards.slice(0, 6).map((one) => `   数据 · ${readText(one, now)}`);
    const more = report.cards.length > 6 ? [`   数据 · …还有 ${String(report.cards.length - 6)} 条`] : [];
    const crash =
      report.crash === undefined
        ? '   崩过：没有'
        : `   崩过：是 —— ${report.crash.reason}（${stampOf(report.crash.at)} · 共 ${String(report.crash.count)} 次）`;
    return [title, ...reads, ...more, crash].join('\n');
  });
  return body.length === 0 ? `${head}${note}` : `${head}${note}\n${body.join('\n')}`;
}

export interface ModuleStatus {
  readonly unit: string;
  readonly name: string;
  readonly dir: string;
  readonly installed: boolean;
  readonly known: boolean;
  readonly open: boolean;
  readonly artifacts: readonly { readonly path: string; readonly at: string | null }[];
  readonly stale: boolean;
  readonly health: SuiteHealth;
  readonly next: string;
}

export function statusOf(options: {
  readonly dir: string;
  readonly unit: string;
  readonly name: string;
  readonly installed: boolean;
  readonly known: boolean;
  readonly open: boolean;
  readonly health: SuiteHealth;
}): ModuleStatus {
  const { dir, unit, name, installed, known, open, health } = options;
  const facts = moduleBuildFacts(dir);

  const next =
    health.state === 'failed'
      ? `它起不来：${health.reason ?? '(没给原因)'} —— 先把这一条修掉（改模块源码 → build；` +
        '改了 package.json / cordis.patch.yml 要重启工作台），别去重装'
      : !installed
        ? '装：workbench_diy_install（第一次）'
        : !known
          ? '面板还不认得这个单元 —— 重启一次工作台（新装的模块要重启才注册进面板），重启后再 workbench_diy_show'
          : !open
            ? '上板：workbench_diy_show（只上板，不重装）'
            : !facts.builtAll
              ? '还没构建：pnpm exec dsh-wb-module build'
              : facts.stale
                ? '源码比产物新：pnpm exec dsh-wb-module build（宿主侧秒级热换；改了 client.js 刷新页面）'
                : '都在生效：改源码 → build（宿主侧秒级热换；改了 client.js 刷新页面），不要再装一遍';

  return {
    unit,
    name,
    dir,
    installed,
    known,
    open,
    artifacts: facts.artifacts,
    stale: facts.stale,
    health,
    next,
  };
}
export function renderStatus(
  root: string,
  lines: readonly ModuleStatus[],
  options: { readonly shellVersion?: string } = {},
): string {
  const sync = syncStateOf(root);
  const notice =
    sync === undefined
      ? undefined
      : syncNotice({
          sync,
          shellVersion: options.shellVersion ?? runningVersionOf(import.meta.url),
          toolchain: toolchainOf(root),
        });
  if (lines.length === 0) {
    const list = renderList(root, [], shapeOf(root));
    return notice === undefined ? list : `${notice}\n${list}`;
  }
  const block = lines.map((one) => {
    const head = `—— ${one.unit}（${one.name}）`;
    const facts =
      `   装：${one.installed ? '是' : '没有'} · 面板认得：${one.known ? '是' : '不是'}` +
      ` · 板上开着：${one.open ? '是' : '没有'}`;
    const artifacts =
      one.artifacts.length === 0
        ? '   产物：没有'
        : `   产物：${one.artifacts
            .map((item) => `${item.path}${item.at === null ? '（缺）' : ` ${item.at.slice(11, 19)}Z`}`)
            .join(' · ')}` + ` · 源码比产物新：${one.stale ? '是' : '没有'}`;
    return [head, facts, `   起得来：${healthText(one.health)}`, artifacts, `   下一步：${one.next}`].join('\n');
  });
  const head = notice === undefined ? `工作区：${root}` : `工作区：${root}\n${notice}`;
  return `${head}\n${block.join('\n')}`;
}

export function renderList(root: string, modules: readonly DiyModule[], shape: WorkspaceShape = 'bare'): string {
  if (modules.length === 0) {
    const what =
      shape === 'workspace'
        ? '它声明了 workspace，但里面的包没有一个报 dsh.workbench.unit'
        : shape === 'package'
          ? '它是一个包（有 package.json），但没声明 dsh.workbench.unit，也没声明 workspace'
          : '它没有 package.json（空项目 / 一堆散文件都算这一档）';
    return [
      `这个工作区里没有模块源码（${root}）—— ${what}；这条会话也还没装过任何模块。`,
      '只看面板 / 调卡片的话不需要模块（workbench_diy_panel 直接看）。',
      '要在这里造一个，先给它一个包目录：pnpm exec dsh-wb-module init <名字> --dir <包目录>/module-<名字> --template diy。',
      '目录按这个仓库的实际情况定 —— 别为了造模块硬改它的结构。',
    ].join('\n');
  }
  const lines = modules.map(
    (one) =>
      `${one.unit} · ${one.installed ? '已装' : '没装'} · ${one.name}` +
      (one.description === '' ? '' : `\n${' '.repeat(one.unit.length)}      ${one.description}`),
  );
  const pending = modules.filter((one) => !one.installed);
  const footer =
    pending.length === 0
      ? '都已装过 —— **不要再装**：改源码 + dsh-wb-module build（宿主侧秒级热换；改了 client.js 刷新一下页面）。'
      : '装：workbench_diy_install（unit=<上面那个 unit>）';
  return `工作区：${root}\n${lines.join('\n')}\n\n${footer}`;
}
