import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared/host';
import type { DebugStore, PanelStateStore } from '@dsh-workbench/shared/host';
import { PANEL_STATE_SERVICE, UNITS_SERVICE, WORKBENCH_ADAPTERS, supplyPortOf } from '@dsh-workbench/shared/host';
import type { AdapterSet } from '@dsh-workbench/shared/host';

import { registerComponentsTool } from './diy-components';
import { registerDebugTools } from './diy-debug-tools';
import { registerLogTools } from './diy-logs';
import { registerBrowserTools } from './diy-browser-tools';

async function unitsAt(
  ctx: DshHostContext,
  exec: DshToolRunContext,
): Promise<{ readonly root: string; readonly units: ReturnType<typeof unitsOf>['units'] }> {
  const { root } = await workspaceOf(ctx, exec);
  return { root, units: unitsOf(ctx, root).units };
}

const UNIT_PARAMETERS = {
  type: 'object',
  properties: { unit: { type: 'string', description: '模块标识（workbench_diy_status 会给）。' } },
  required: ['unit'],
  additionalProperties: false,
} as const;

export function browserBridgeOn(ctx: DshHostContext): boolean {
  const adapters = ctx.get(WORKBENCH_ADAPTERS, false) as AdapterSet | undefined;
  if (adapters === undefined) return true;
  return adapters.runtime.capabilities(ctx).browserBridge;
}

import { registerSpecTool } from './diy-spec';
import { registerPublishTool } from './diy-publish';
import type { UnitRegistry } from '@/kernel/host/unit-registry';
import { keywordsOf, reconOf } from '@/shared/api/host/diy-recon';
import { surfaceOf } from '@/shared/api/host/runtime-surface';
import { installedPluginsOf, reconCatalogOf } from '@/shared/api/host/diy-recon-fs';
import { healthOf, publishStatusOf, renderPanel, renderStatus, statusOf, type ModuleStatus } from './diy-report';
import type { PublishPreview } from '@dsh-workbench/shared/contract/protocol/market-index';
import { insideRoot } from '@/shared/api/host/diy-modules';
import {
  asRecord,
  asText,
  modulesOf,
  OUTPUT,
  panelEntriesOf,
  plainJson,
  showOrReason,
  unitsOf,
  verdictOf,
  workspaceOf,
  type KnownUnit,
} from './diy-context';
import type { MarketService } from './market';
import type { PanelsService } from './service';
import {
  DIY_INSTALL_TOOL,
  DIY_PANEL_TOOL,
  DIY_RECON_TOOL,
  DIY_SHOW_TOOL,
  DIY_STATUS_TOOL,
} from '../unit';

export function registerDiyTools(
  ctx: DshHostContext,
  market: MarketService,
  panels: PanelsService,
  debug: DebugStore,
  previewOf: (unit: string) => PublishPreview | null = () => null,
  inferredAuthorOf: (unit: string) => Promise<string | undefined> = async () => undefined,
): Array<() => void> {
  const supply = supplyPortOf(ctx);
  const tools = ctx.get('tools') as DshToolRegistry | undefined;
  if (tools === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 没有 tools 服务，跳过 DIY 工具注册');
    return [];
  }

  const statusTool: DshToolDefinition = {
    name: DIY_STATUS_TOOL,
    description:
      '先跑它：装了什么、这个工作区里有没有源码、面板认不认得、起得来没、下一步做什么（不填 unit = 全看）。',
    parameters: {
      type: 'object',
      properties: { unit: { type: 'string', description: '模块标识（workbench_diy_status 会给）。' } },
      required: [],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root, units } = await unitsAt(ctx, exec);
      const registry = ctx.get(UNITS_SERVICE) as UnitRegistry | undefined;
      const panelEntries = panelEntriesOf(panels, root);
      const wanted = asText(asRecord(raw)['unit']);
      const picked = wanted === '' ? units : units.filter((one) => one.unit === wanted);
      if (wanted !== '' && picked.length === 0) {
        throw new Error(
          `这条会话里没有单元 id 为「${wanted}」的模块` +
            `（装过的：${units.map((one) => one.unit).join(', ') || '（空）'}）`,
        );
      }
      const rows = picked.map(
        (one): ModuleStatus =>
          statusOf({
            dir: one.dir,
            unit: one.unit,
            name: one.name,
            installed: one.installed,
            known: panelEntries.some((entry) => entry.id === one.unit),
            open: panels.isEnabled(one.unit, root),
            health: healthOf({ registry, unit: one.unit, installed: one.installed }),
            mountedAt: registry?.addedAt?.(one.unit),
          }),
      );
      const preview = wanted === '' ? null : previewOf(wanted);
      const text = [renderStatus(root, rows), publishStatusOf(preview)].filter((one) => one !== '').join('\n');
      return plainJson({
        workspace: root,
        status: rows,
        ...(preview === null ? {} : { publish: preview }),
        text,
      });
    },
  };

  const panelTool: DshToolDefinition = {
    name: DIY_PANEL_TOOL,
    description: '面板此刻的真实样子（每张卡读到没 / 崩没崩）—— 用户说"卡片不对 / 一片空白"就先调它。',
    parameters: {
      type: 'object',
      properties: { unit: { type: 'string', description: '只看某一个模块（不填 = 全看）。' } },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const { installed, units } = unitsOf(ctx, root);
      const panelState = ctx.get(PANEL_STATE_SERVICE) as PanelStateStore | undefined;
      const registry = ctx.get(UNITS_SERVICE) as UnitRegistry | undefined;
      const panelEntries = panelEntriesOf(panels, root);
      const snapshot = panelState?.snapshot(root) ?? { workspace: root, at: 0, units: [] };
      const wanted = asText(asRecord(raw)['unit']);
      const board = panelEntries.filter((entry) => entry.shown && entry.hasCard).map((entry) => entry.id);
      const nameOf = new Map(units.map((one) => [one.unit, one.name]));
      const reported = new Map(snapshot.units.map((one) => [one.unit, one]));
      const order = [...new Set([...board, ...reported.keys(), ...nameOf.keys()])];
      const rows = order
        .filter((unit) => wanted === '' || unit === wanted)
        .map((unit) => {
          const report = reported.get(unit);
          return {
            unit,
            name: nameOf.get(unit) ?? '',
            health: healthOf({ registry, unit, installed: installed.includes(unit) }),
            mountedAt: registry?.addedAt?.(unit),
            ...(report === undefined ? {} : { report }),
          };
        });
      const text = renderPanel({
        root,
        rows,
        board,
        at: snapshot.at,
        now: Date.now(),
      });
      return plainJson({ workspace: root, board, report: snapshot, panels: rows, text });
    },
  };

  const surface = surfaceOf(ctx);
  const reconTool: DshToolDefinition = {
    name: DIY_RECON_TOOL,
    description:
      surface === undefined
        ? '这个运行时的命令面探测不了：直接走 workbench_diy_eval / _find 读一次。'
        : `先查 ${surface.name} 有没有现成的（自带 adapter / 本机插件）—— ${surface.name} 是什么自己查，别问用户。`,
    parameters: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: '站点名 / 系统名 / 域名（英文名或域名最准，例：bilibili、arxiv.org、inventory）。',
        },
        url: { type: 'string', description: '那套系统的地址（从它取域名）。' },
      },
      required: ['keyword'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, _exec: DshToolRunContext) {
      const args = asRecord(raw);
      const surface = surfaceOf(ctx);
      if (surface === undefined) {
        throw new Error(
          '这个运行时没有可探测的命令面 —— recon 用不了；换 workbench_diy_eval / _find 直接读一次：' +
            '带 read=<地址>，在 workbench-read 上跑，借用户已登录的那扇窗。',
        );
      }
      const keywords = keywordsOf(asText(args['keyword']), asText(args['url']));
      if (keywords.length === 0) {
        throw new Error(
          `recon 要一个关键词（站点名 / 系统名 / 域名都行）：先拿它去 ${surface.name} 自带的那份目录里找有没有现成的能力，` +
            '别一上来就自己写 adapter；用户不知道它有这条命令面，这一步别问用户。',
        );
      }
      const catalogPath = supply.cliCatalogPath?.();
      if (catalogPath === undefined) {
        throw new Error(
          `这个运行时没有命令目录 —— ${surface.name} 那边只给命令面、不给目录；` +
            '改用 workbench_diy_find 按站点问它能做什么。',
        );
      }
      const catalog = reconCatalogOf(catalogPath);
      if (catalog === undefined) {
        const hint = supply.runtimeInstallCommand?.() ?? '请先完成隔离运行时的安装';
        throw new Error(`读不到 ${surface.name} 那份目录（${catalogPath}）—— 隔离运行时尚未安装完成；照做：${hint}`);
      }
      const pluginsDir = supply.vendorPluginsDir?.();
      const installed = pluginsDir === undefined ? [] : installedPluginsOf(pluginsDir, surface.pluginPrefix);
      const answer = reconOf(catalog, installed, keywords, surface);
      return plainJson({ ok: true, ...answer });
    },
  };

  function unitAmong(units: readonly KnownUnit[], raw: unknown, label: string): KnownUnit {
    const unit = asText(asRecord(raw)['unit']);
    const pool = units.map((one) => one.unit);
    if (unit === '') {
      throw new Error(`${label} 要一个 unit（装过的：${pool.join(', ') || '（空）'}）`);
    }
    const found = units.find((one) => one.unit === unit);
    if (found === undefined) {
      throw new Error(`这条会话里没有单元 id 为「${unit}」的模块（装过的：${pool.join(', ') || '（空）'}）`);
    }
    return found;
  }

  function unitOf(root: string, raw: unknown, label: string) {
    const { modules } = modulesOf(ctx, root);
    const unit = asText(asRecord(raw)['unit']);
    if (unit === '') {
      throw new Error(`${label} 要一个 unit（这个工作区里：${modules.map((one) => one.unit).join(', ') || '（空）'}）`);
    }
    const found = modules.find((one) => one.unit === unit);
    if (found === undefined) {
      throw new Error(
        `这个工作区里没有单元 id 为「${unit}」的模块` +
          `（可用的：${modules.map((one) => one.unit).join(', ') || '（空）'}）—— 先安装的前提是它在这个工作区里创建好了`,
      );
    }
    if (!insideRoot(root, found.dir)) {
      throw new Error(`这个模块不在这个工作区里（${found.dir}）—— 只装 ${root} 之下的模块`);
    }
    return found;
  }

  const showTool: DshToolDefinition = {
    name: DIY_SHOW_TOOL,
    description: '只显示在看板（不安装）：把一个已经安装完成的模块显示在当前工作区的面板上。',
    parameters: UNIT_PARAMETERS,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root, units } = await unitsAt(ctx, exec);
      const found = unitAmong(units, raw, 'workbench_diy_show');
      if (!found.installed) {
        throw new Error(
          `${found.unit} 还没安装 —— 只显示在看板的前提是它已安装过。先用 workbench_diy_install（第一次）`,
        );
      }
      const panel = showOrReason(panels, found.unit, root);
      const text = panel.ok
        ? `面板上已经打开它了（${root}）—— 验收就走这一张卡（你自己走一遍）`
        : `面板上还没打开：${panel.reason}。这就是它的下一步（workbench_diy_status 会给出同样的判断）`;
      return plainJson({ workspace: root, unit: found.unit, path: found.dir, panel, text });
    },
  };

  const installTool: DshToolDefinition = {
    name: DIY_INSTALL_TOOL,
    description:
      '把这个工作区里创建好的模块安装并显示到当前工作区的面板。这是持久变更，一个模块只装一次：' +
      '之后改源码只需 dsh-wb-module build（宿主侧秒级热换）。',
    parameters: UNIT_PARAMETERS,
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const found = unitOf(root, raw, 'workbench_diy_install');

      if (found.installed) {
        const panel = showOrReason(panels, found.unit, root);
        const text = [
          '它已经装过了（就是这个工作区里这一份）—— **不要再装**：改源码 + dsh-wb-module build（宿主侧与 client.js 都秒级热换 —— dsh-client-hmr 盯着每个 bundle 的 lib/client.js，重建了就换进已打开的页面）。',
          panel.ok
            ? `面板上已经打开它了（${root}）—— 验收就走这一张卡（你自己走一遍）`
            : `面板上还没打开：${panel.reason}。调 workbench_diy_show（unit=${found.unit}）`,
        ].join('\n');
        return plainJson({
          workspace: root,
          unit: found.unit,
          path: found.dir,
          alreadyInstalled: true,
          panel,
          text,
        });
      }

      const outcome = await market.installBundle(found.dir);
      const verdict = verdictOf(outcome.change);
      const restartRequired = outcome.change.application === 'restart-required';
      const panel =
        outcome.change.application === 'applied'
          ? showOrReason(panels, found.unit, root)
          : { ok: false, reason: `安装结果是 ${outcome.change.application}，还没生效` };

      const panelText = panel.ok
        ? `面板上已经打开它了（${root}）—— 验收就走这一张卡（你自己走一遍）`
        : outcome.change.application === 'applied'
          ? `面板上还没打开：${panel.reason}。调 workbench_diy_show（unit=${found.unit}）试试。`
          : restartRequired
            ? `面板上还没打开（${panel.reason}）：模块要**重启一次工作台**才注册进面板 —— 把这句话转给用户，` +
              `重启后再调 workbench_diy_show（unit=${found.unit}）。`
            : `面板上还没打开：${panel.reason}。先把上面那句"没装成"处理掉，再谈显示在看板。`;

      const text = [
        `${verdict}：${found.unit}（${found.name}）`,
        panelText,
        '之后只改源码 + dsh-wb-module build（宿主侧与 client.js 都秒级热换 —— dsh-client-hmr 盯着每个 bundle 的 lib/client.js，重建了就换进已打开的页面）：不要再装一遍。',
      ].join('\n');

      return plainJson({
        workspace: root,
        unit: found.unit,
        path: found.dir,
        install: outcome.change,
        module: outcome.module,
        panel,
        text,
      });
    },
  };

  return [
    tools.register(statusTool),
    tools.register(panelTool),
    ...registerComponentsTool(ctx, tools),
    tools.register(reconTool),
    ...registerSpecTool(ctx, tools),
    ...registerLogTools(ctx, tools),
    ...(browserBridgeOn(ctx) ? registerBrowserTools(ctx, tools) : []),
    ...registerDebugTools(ctx, tools, debug),
    tools.register(showTool),
    tools.register(installTool),
    registerPublishTool(ctx, tools, {
      resolve: (root, raw) => unitOf(root, raw, 'workbench_diy_publish'),
      previewOf,
      inferredAuthorOf,
    }),
  ];
}
