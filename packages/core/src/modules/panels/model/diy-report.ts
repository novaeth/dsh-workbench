import { join } from 'node:path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
import type { PanelUnitReport } from '@dsh-workbench/shared/host';
import type { PublishPreview } from '@dsh-workbench/shared/contract/protocol/market-index';

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
import { runningVersionOf, workbenchRoot } from '@dsh-workbench/shared/host';

export const SYNC_STALE_MINUTES = 15;

export const SYNC_STALE_MS = SYNC_STALE_MINUTES * 60_000;

function fixText(): string {
  return `   修复方法：在工坊目录中运行一次 pnpm install（${join(workbenchRoot(), 'diy')}）。若仍失败，请删除该目录后重启工作台（骨架会自动重建；\`packages/\` 下你创建的模块请先保留或另存）。`;
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
  const where = gap === undefined ? '工坊中读不到那三个包的版本' : `工坊中 ${gap}`;
  if (about !== undefined && about.state === 'failed') {
    return [
      `⚠️ 工坊工具链仍为上一代（${where}；工作台已是 ${shellVersion}）：${about.reason ?? '(未提供原因)'}`,
      fixText(),
    ].join('\n');
  }
  if (about !== undefined && about.state === 'syncing') {
    if (syncingStillRunning(about.at, now, windowMs)) {
      return `⏳ 工坊工具链正在后台同步到 ${shellVersion}。同步期间按上一代版本运行，无需等待。`;
    }
    return [
      `⚠️ 工坊工具链上次同步未完成（记录停在 ${about.at}，已超过 ${String(Math.round(windowMs / 60_000))} 分钟）：` +
        `${where}；工作台已是 ${shellVersion}。`,
      fixText(),
    ].join('\n');
  }
  if (gap === undefined) return undefined;
  return (
    `⏳ 工坊工具链仍为上一代（工坊中 ${gap}，工作台 ${shellVersion}）。` +
    `下一轮工作台启动时会同步到 ${shellVersion}；若持续如此，请查看工坊的 seed.log（${join(workbenchRoot(), 'seed.log')}）。`
  );
}

export interface SuiteHealth {
  readonly state: 'ok' | 'failed' | 'absent';
  readonly reason?: string;
}

export interface RegistryLike {
  all(): readonly { readonly unit: string }[];
  addedAt?(unit: string): number | undefined;
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
    reason: installed ? '工作台尚未读取它的声明；新安装的模块需要重启一次工作台' : '尚未安装',
  };
}

function healthText(health: SuiteHealth): string {
  if (health.state === 'ok') return '是';
  if (health.state === 'failed') return `否（${health.reason ?? '(未提供原因)'}）`;
  return `尚未就绪（${health.reason ?? '状态未知'}）`;
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
  if (read.phase === 'ready') return `${read.route} 已读取（${when}）`;
  if (read.phase === 'loading') return `${read.route} 正在读取（${when}）`;
  if (read.phase === 'idle') return `${read.route} 未在取数（${when}）`;
  const code = read.error?.code ?? 'unknown';
  const message = read.error?.message ?? '';
  return `${read.route} 读取失败（${code}）${message === '' ? '' : `：${message}`}（${when}）`;
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
      ? '\n还没有面板运行态上报。面板上从未发生取数或渲染：可能是当前工作区的面板未启用模块界面，也可能是用户页面仍为刷新前的旧版本（上报需要刷新一次页面才会带上）。'
      : `\n面板上有 ${String(board.length)} 个模块界面；运行态来自用户页面（最后一次上报 ${stampOf(at)}，${ageText(at, now)}）`;
  const body = rows.map((row) => {
    const title = `—— ${row.unit}${row.name === '' ? '' : `（${row.name}）`} · ${healthText(row.health)}`;
    const report = row.report;
    if (report === undefined) {
      return [title, `   未上报：模块界面未渲染，或用户页面尚未刷新到包含该补丁的版本`].join('\n');
    }
    const reads = report.cards.slice(0, 6).map((one) => `   数据 · ${readText(one, now)}`);
    const more = report.cards.length > 6 ? [`   数据 · …还有 ${String(report.cards.length - 6)} 条`] : [];
    const crash =
      report.crash === undefined
        ? '   未发生崩溃'
        : `   发生过崩溃：${report.crash.reason}（${stampOf(report.crash.at)}，共 ${String(report.crash.count)} 次）`;
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
  readonly mountedAt?: number | undefined;
}): ModuleStatus {
  const { dir, unit, name, installed, known, open, health } = options;
  const facts = moduleBuildFacts(dir);
  const mountedAt = options.mountedAt;
  const newerThanRun =
    mountedAt !== undefined &&
    facts.artifacts.some((one) => {
      const at = one.at === null ? Number.NaN : Date.parse(one.at);
      return Number.isFinite(at) && at > mountedAt;
    });

  const next =
    health.state === 'failed'
      ? `它启动失败：${health.reason ?? '(未提供原因)'}。请先修复该问题（修改模块源码后执行 build；` +
      '若修改了 package.json / cordis.patch.yml，需要重启工作台）。不要重新安装'
      : !installed
        ? '安装：workbench_diy_install（首次）'
        : !known
          ? '面板尚未识别该模块。请重启一次工作台（新安装的模块需要重启后才注册到面板），然后再调用 workbench_diy_show'
          : !open
            ? '显示在看板：workbench_diy_show（仅显示，不重新安装）'
            : !facts.builtAll
              ? '尚未构建：pnpm exec dsh-wb-module build'
              : facts.stale
                ? '源码比产物新：pnpm exec dsh-wb-module build（宿主侧秒级热替换；修改 client.js 后刷新页面）'
                : newerThanRun
                  ? '产物比运行中的实例新：热更没落地（模块加载失败时最常见），改完源码再 build 一次；还不行就重启工作台'
                  : '均已生效：修改源码后执行 build（宿主侧秒级热替换；修改 client.js 后刷新页面），无需再次安装';

  return {
    unit,
    name,
    dir,
    installed,
    known,
    open,
    artifacts: facts.artifacts,
    stale: facts.stale,
    ...(mountedAt === undefined ? {} : { mountedAt }),
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
      `   安装：${one.installed ? '是' : '否'} · 面板已识别：${one.known ? '是' : '否'}` +
      ` · 面板已启用：${one.open ? '是' : '否'}`;
    const artifacts =
      one.artifacts.length === 0
        ? '   产物：无'
        : `   产物：${one.artifacts
            .map((item) => `${item.path}${item.at === null ? '（缺）' : ` ${item.at.slice(11, 19)}Z`}`)
            .join(' · ')}` + ` · 源码比产物新：${one.stale ? '是' : '否'}`;
    return [head, facts, `   启动状态：${healthText(one.health)}`, artifacts, `   下一步：${one.next}`].join('\n');
  });
  const head = notice === undefined ? `工作区：${root}` : `工作区：${root}\n${notice}`;
  return `${head}\n${block.join('\n')}`;
}

export function publishStatusOf(preview: PublishPreview | null): string {
  if (preview === null) return '';
  const exit =
    preview.market === undefined
      ? preview.registry === undefined
        ? '发布出口：安装包（当前环境未配置可发布的模块来源，模块也未声明 publishConfig.registry）'
        : `发布出口：团队源 ${preview.registry}（package.json 的 publishConfig.registry）`
      : `发布出口：市场索引 ${preview.market.url}` +
        `${preview.market.ref === undefined ? '' : `（${preview.market.ref}）`}` +
        `。未提供 target 时默认发布到这里；本次将发布 ${preview.market.nextVersion ?? preview.version}`;
  const labels =
    preview.market === undefined
      ? undefined
      : preview.labels === undefined || preview.labels.length === 0
        ? '标签：尚未设置。发布到市场时请提供 1–2 个（labels）'
        : `标签：${preview.labels.join(' · ')}`;
  const changelog =
    preview.changelog === undefined
      ? undefined
      : preview.changelog.missing
        ? `发布前置：CHANGELOG 中缺少 ${preview.changelog.version} 版本。发布时请提供 changelogNote（会先创建文件）`
        : `发布前置：CHANGELOG 中已有 ${preview.changelog.version}`;
  return [exit, labels, changelog].filter((one) => one !== undefined).join('\n');
}

export function renderList(root: string, modules: readonly DiyModule[], shape: WorkspaceShape = 'bare'): string {
  if (modules.length === 0) {
    const what =
      shape === 'workspace'
        ? '它声明了 workspace，但里面的包没有一个报 dsh.workbench.unit'
        : shape === 'package'
          ? '它是一个包（有 package.json），但没声明 dsh.workbench.unit，也没声明 workspace'
          : '它没有 package.json（空项目或散落的文件都属于这一类）';
    return [
      `这个工作区中没有模块源码（${root}）。${what}；当前会话也尚未安装任何模块。`,
      '只看面板或调试模块界面时不需要模块（workbench_diy_panel 可直接查看）。',
      '要在这里创建模块，请先提供包目录：pnpm exec dsh-wb-module init <名字> --dir <包目录>/module-<名字> --template diy。',
      '目录按该仓库的实际情况确定，不要为了创建模块而强行修改其结构。',
    ].join('\n');
  }
  const lines = modules.map(
    (one) =>
      `${one.unit} · ${one.installed ? '已安装' : '未安装'} · ${one.name}` +
      (one.description === '' ? '' : `\n${' '.repeat(one.unit.length)}      ${one.description}`),
  );
  const pending = modules.filter((one) => !one.installed);
  const footer =
    pending.length === 0
        ? '均已安装过，**不要再次安装**：修改源码后执行 dsh-wb-module build（宿主侧秒级热替换；修改 client.js 后刷新页面）。'
        : '安装：workbench_diy_install（unit=<上述 unit>）';
  return `工作区：${root}\n${lines.join('\n')}\n\n${footer}`;
}
