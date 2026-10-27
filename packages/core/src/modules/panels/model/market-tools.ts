import type { DshHostContext, DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared';
import type {
  MarketSourceConfig,
  MarketSourcesPayload,
} from '@dsh-workbench/shared/contract/protocol/market-index';
import type { MarketSourceInitializer } from '@/shared/api/host/market-source-init';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { hostSurface } from '@dsh-workbench/shared/host';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import type { BundleSupply, MarketEntry, MarketService } from './market';
import type { SharedDependency } from './market-dependency';
import { pluginKeptText, type PluginUninstallOutcome } from './plugin-actions';
import { marketSourcesTool } from './market-sources-tool';
import {
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_LIST_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UPDATE_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
  MARKET_ENABLE_TOOL,
  MARKET_DISABLE_TOOL,
} from '../unit';

function supplyNamesOf(entry: MarketEntry): readonly string[] {
  return entry.needs
    .filter((need) => need.kind === 'extension' || need.kind === 'lib')
    .map((need) => need.name);
}

function stateOf(entry: MarketEntry): string {
  switch (entry.capability.status) {
    case 'ok':
      return '已装，可用';
    case 'missing':
      return '未装';
    case 'outdated':
      return `已装但版本旧（${entry.capability.detail}）`;
    case 'degraded':
      return `可选依赖没装（${entry.capability.detail}）`;
    case 'unsupported':
      return `需要更新的工作台（${entry.capability.detail}）`;
    default:
      return `探不动：${entry.capability.detail}`;
  }
}

function stateOfDependency(dep: SharedDependency): string {
  switch (dep.status) {
    case 'ok':
      return '已就绪';
    case 'outdated':
      return '有新版';
    case 'unsatisfied':
      return '版本不对';
    case 'missing':
      return '未装';
    default:
      return '探不动';
  }
}

function versionsOf(dep: SharedDependency): string {
  if (dep.installed === undefined) return '';
  return dep.latest === undefined ? ` · ${dep.installed}` : ` · ${dep.installed} → ${dep.latest}`;
}

function render(entries: readonly MarketEntry[], shared: readonly SharedDependency[]): string {
  const modules =
    entries.length === 0
      ? '没有可安装的模块。'
      : entries
          .map(
            (entry) =>
              `${entry.unit} · ${stateOf(entry)}` +
              (supplyNamesOf(entry).length === 0 ? '' : ` · 插件 ${supplyNamesOf(entry).join('、')}`),
          )
          .join('\n');
  if (shared.length === 0) return modules;
  const deps = shared
    .map(
      (dep) =>
        `${dep.id} · ${stateOfDependency(dep)}${versionsOf(dep)}` +
        (dep.usedBy.length === 0 ? '' : ` · 供 ${dep.usedBy.join('、')} 使用`),
    )
    .join('\n');
  return `${modules}\n\n共用依赖（只有升级）：\n${deps}`;
}

const REMOVE_BLOCKED = new Set(['not-removable', 'management-required', 'stop-profile', 'bundle-in-use']);

function failureText(change: BundleChange): string {
  const code = change.errorCode ?? change.application;
  if (code === 'already-installed') {
    return '它已经在这份 profile 里，而这次没能把它卸下来（这一版 dsh 不肯就地覆盖装，得先卸再装）';
  }
  const surface = hostSurface();
  return REMOVE_BLOCKED.has(code)
    ? `旧版卸不掉，而这一版 dsh 又不许就地覆盖装 —— 让用户${surface.restartHint}，或者${
        surface.deployment === 'desktop' ? '从 Desktop 的插件页更新' : '从终端更新'
      }`
    : code;
}

function describeInstall(
  spec: string,
  module: InstalledModule,
  supply: BundleSupply,
  change: BundleChange,
): string {
  const verdict =
    change.application === 'applied'
      ? '装好了，已生效'
      : change.application === 'restart-required'
        ? `装好了，要${hostSurface().restartHint} 才生效`
        : `没成功：${failureText(change)}`;
  const who = module.kind === 'module' ? `${module.unit}（${module.pkg}）` : module.pkg;
  const tail =
    supply.state === 'installed'
      ? '；它要的 opencli 插件也装上了'
      : supply.state === 'pending-restart'
        ? '；重启后再装它要的 opencli 插件'
        : supply.state === 'not-a-module'
          ? '；但它不是工作台模块（没有 dsh.workbench 声明，不会出现在面板上）'
          : supply.state === 'failed'
            ? `；但它要的插件没装上：${supply.reason}`
            : '';
  return `${verdict}：${who}${tail}（spec：${spec}）`;
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    modules: { type: 'array', items: { type: 'object', additionalProperties: true } },
    shared: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
  additionalProperties: true,
};

const OUTPUT = {
  schema: OUTPUT_SCHEMA,
  render: (_args: unknown, value: unknown) => {
    const payload = value as { text?: unknown } | null;
    return [{ type: 'text', text: typeof payload?.text === 'string' ? payload.text : JSON.stringify(value) }];
  },
};

function textArg(raw: unknown, key: string): string {
  if (typeof raw !== 'object' || raw === null) return '';
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim() : '';
}

function describePluginUninstall(pkg: string, outcome: PluginUninstallOutcome): string {
  if (outcome.removed) return `已卸载 opencli 插件 ${pkg}：没人再用它，文件也删了。`;
  return `已从「你装的插件」里去掉 ${pkg}。${outcome.kept === undefined ? '' : pluginKeptText(outcome.kept)}`;
}

function describeWorkbenchUpdate(change: BundleChange): string {
  if (change.application === 'failed' || change.application === 'cancelled') {
    return `没成功：${failureText(change)}`;
  }
  return change.application === 'restart-required'
    ? `工作台更新到新版了 —— 这一版要${hostSurface().restartHint} 才生效（重启由用户来，别自己重启）。`
    : '工作台更新到新版了 —— 客户端与宿主自己换上，不用重启。';
}

function usersOf(shared: readonly SharedDependency[], names: readonly (string | undefined)[]): string {
  const hit = shared.find(
    (item) => names.some((name) => name !== undefined && name !== '' && item.id === `extension:${name}`),
  );
  if (hit === undefined || hit.usedBy.length === 0) return '';
  return `它被 ${hit.usedBy.join('、')} 用着（动的是它们的供给，它们的状态跟着重探了一遍）`;
}

export interface MarketSourceGateway {
  readonly read: () => MarketSourcesPayload;
  readonly init: MarketSourceInitializer;
  readonly readOnly: (id: string) => Promise<MarketSourceConfig>;
}

export function registerMarketTools(
  ctx: DshHostContext,
  market: MarketService,
  sources?: MarketSourceGateway,
): Array<() => void> {
  const tools = ctx.get<DshToolRegistry>('tools');
  if (tools === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 没有 tools 服务，跳过模块市场工具注册');
    return [];
  }

  const noParams = { type: 'object', properties: {}, additionalProperties: false };

  async function idOrList(raw: unknown, label: string): Promise<string> {
    const id = textArg(raw, 'id');
    if (id !== '') return id;
    const { modules, shared } = await market.list();
    throw new Error(
      `${label} 需要一个 id（例如 issues）。可安装的模块：` +
        `${modules.map((entry) => entry.unit).join(', ') || '（空）'}；` +
        `共用依赖：${shared.map((dep) => dep.id).join(', ') || '（空）'}`,
    );
  }

  function moduleSupplyTool(spec: {
    readonly name: string;
    readonly description: string;
    readonly install: boolean;
  }): DshToolDefinition {
    return {
      name: spec.name,
      description: spec.description,
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '模块 id（如 issues）。' } },
        required: ['id'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(raw: unknown) {
        const id = await idOrList(raw, spec.name);
        const entry = spec.install ? await market.install(id) : await market.update(id);
        const verb = spec.install ? '已安装' : '已更新';
        return { module: entry, text: `${verb} ${id}：${stateOf(entry)}` };
      },
    };
  }

  const listTool: DshToolDefinition = {
    name: MODULES_LIST_TOOL,
    description: '看模块市场与已装：每个模块装没装、可用不可用、要哪些 opencli 插件；还有共用依赖（只有升级）。',
    parameters: noParams,
    output: OUTPUT,
    async execute() {
      const { modules, shared } = await market.list();
      return { modules, shared, text: render(modules, shared) };
    },
  };

  const installTool = moduleSupplyTool({
    name: MODULES_INSTALL_TOOL,
    description: '按模块 id 装它声明的那份外部供给（opencli 插件与库），不换模块包本身。',
    install: true,
  });

  const updateTool = moduleSupplyTool({
    name: MODULES_UPDATE_TOOL,
    description: '按模块 id 升它声明的那份外部供给（opencli 插件与库），不换模块包本身。',
    install: false,
  });

  const uninstallTool: DshToolDefinition = {
    name: MODULES_UNINSTALL_TOOL,
    description: '卸模块：连模块包一起卸（只动工作台自己装的那一份）；要换一份实现先卸再装。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: '模块 id（如 issues）。' } },
      required: ['id'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      const id = await idOrList(raw, MODULES_UNINSTALL_TOOL);
      const outcome = await market.uninstall(id);
      const kept =
        outcome.keptFor.length === 0
          ? ''
          : `（还有模块在面板上要用其中一份安装，所以那份留着：${outcome.keptFor.join('、')}）`;
      return { module: outcome.entry, text: `已卸载 ${id}：${stateOf(outcome.entry)}${kept}` };
    },
  };

  const installBundleTool: DshToolDefinition = {
    name: MODULES_INSTALL_BUNDLE_TOOL,
    description: '按 spec 把模块包装进这份 profile（包名 / git 地址 / tarball / 本地路径）；装完它要的插件也一起装。',
    parameters: {
      type: 'object',
      properties: {
        spec: { type: 'string', description: '包名（可带 @版本）/ git 地址 / tarball / 本地路径。' },
        registry: { type: 'string', description: '去哪个源装（不填用 profile 自己配的源）。' },
      },
      required: ['spec'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      const spec = textArg(raw, 'spec');
      if (spec === '') {
        throw new Error(
          'install-bundle 需要一个 spec：包名（可带版本，如 @scope/module@1.2.3），也可以是 git 地址 / tarball / 本地绝对路径。',
        );
      }
      const registry = textArg(raw, 'registry');
      const outcome = await market.installBundle(spec, registry === '' ? {} : { registry });
      return {
        change: outcome.change,
        module: outcome.module,
        supply: outcome.supply,
        text: describeInstall(spec, outcome.module, outcome.supply, outcome.change),
      };
    },
  };

  const updateDependencyTool: DshToolDefinition = {
    name: MODULES_UPDATE_DEPENDENCY_TOOL,
    description: '升共用依赖（工作台自己那份营生，如 plugin:demo）：只有升级，用依赖 id。',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '共用依赖 id（如 plugin:demo）。' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      const id = await idOrList(raw, MODULES_UPDATE_DEPENDENCY_TOOL);
      const shared = await market.updateDependency(id);
      const dep = shared.find((item) => item.id === id);
      return {
        shared,
        text: `已更新共用依赖 ${id}${dep === undefined ? '' : `：${stateOfDependency(dep)}`}`,
      };
    },
  };

  function pluginTool(spec: { readonly name: string; readonly description: string; readonly update: boolean }): DshToolDefinition {
    return {
      name: spec.name,
      description: spec.description,
      parameters: {
        type: 'object',
        properties: {
          plugin: { type: 'string', description: 'opencli 插件的包名或插件名（如 inventory）。' },
        },
        required: ['plugin'],
        additionalProperties: false,
      },
      output: OUTPUT,
      async execute(raw: unknown) {
        const plugin = textArg(raw, 'plugin');
        if (plugin === '') {
          throw new Error(
            `${spec.name} 需要一个 plugin：opencli 插件的包名或插件名 —— 就是市场「已安装 opencli 插件」那一段里的名字。`,
          );
        }
        if (spec.update) {
          const updated = await market.updatePlugin(plugin);
          const users = usersOf((await market.list()).shared, [updated.name, plugin]);
          return { text: `已更新 opencli 插件 ${plugin}${users === '' ? '。' : `；${users}。`}` };
        }
        const outcome = await market.uninstallPlugin(plugin);
        const users = usersOf((await market.list()).shared, [outcome.name, plugin]);
        return {
          removed: outcome.removed,
          ...(outcome.name === undefined ? {} : { name: outcome.name }),
          ...(outcome.kept === undefined ? {} : { kept: outcome.kept }),
          text: `${describePluginUninstall(plugin, outcome)}${users === '' ? '' : `${users}。`}`,
        };
      },
    };
  }

  const updatePluginTool = pluginTool({
    name: MODULES_UPDATE_PLUGIN_TOOL,
    description: '更新用户装的 opencli 插件（按包名或插件名）；老插件跑不动了先试它。',
    update: true,
  });

  const uninstallPluginTool = pluginTool({
    name: MODULES_UNINSTALL_PLUGIN_TOOL,
    description: '卸用户装的 opencli 插件：没人再用它时文件也删；还有模块用着就只从名单去掉。',
    update: false,
  });

  const updateWorkbenchTool: DshToolDefinition = {
    name: MODULES_UPDATE_WORKBENCH_TOOL,
    description: '把工作台自己更新到源上的新版（要重启时结果里会说；重启由用户来）。',
    parameters: noParams,
    output: OUTPUT,
    async execute() {
      const outcome = await market.updateWorkbench('');
      return { change: outcome.change, text: describeWorkbenchUpdate(outcome.change) };
    },
  };

  const enableTool: DshToolDefinition = {
    name: MARKET_ENABLE_TOOL,
    description: '把索引源设为可发布（只改本机配置，不碰仓库）；要用户审批。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: '索引源 id；不填=当前选中的那个。' } },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      if (sources === undefined) throw new Error('这台机器上没有索引源服务，设不了可发布');
      const payload = sources.read();
      const asked = textArg(raw, 'id');
      const id = asked === '' ? payload.selected : asked;
      const source = id === null ? undefined : payload.sources.find((one) => one.id === id);
      if (source === undefined) {
        const known = payload.sources.map((one) => one.id).join('、') || '（空）';
        throw new Error(
          `没有这个索引源${asked === '' ? '' : `：${asked}`}。现有的：${known}；先在「模块市场 → 发现 → 索引源」里加一个。`,
        );
      }
      if (source.kind !== 'git') throw new Error(`索引源 ${source.id} 是 http 地址，只能读，不能当发布目的地`);
      if (source.policy === 'artifacts-in-repo') {
        return { source, changed: false, text: `已经是可发布：${source.label}（${source.url}）` };
      }
      const result = await sources.init({ id: source.id, stampOnly: true });
      return {
        source: result.source,
        branch: result.branch,
        commit: result.commit,
        changed: true,
        text: `已把「${source.label}」设为可发布（${source.url}，分支 ${result.branch}）—— 仓库本身没动。之后发布可以落到它的 ${source.path ?? 'market.json'}。`,
      };
    },
  };

  const readOnlyTool: DshToolDefinition = {
    name: MARKET_DISABLE_TOOL,
    description: '把索引源改回只读（不再作为发布目的地；只改本机配置）。',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: '索引源 id；不填=当前选中的那个。' } },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown) {
      if (sources === undefined) throw new Error('这台机器上没有索引源服务，改不了');
      const payload = sources.read();
      const asked = textArg(raw, 'id');
      const id = asked === '' ? payload.selected : asked;
      const source = id === null ? undefined : payload.sources.find((one) => one.id === id);
      if (source === undefined) {
        const known = payload.sources.map((one) => one.id).join('、') || '（空）';
        throw new Error(
          `没有这个索引源${asked === '' ? '' : `：${asked}`}。现有的：${known}；先在「模块市场 → 发现 → 索引源」里加一个。`,
        );
      }
      if (source.kind !== 'git') throw new Error(`索引源 ${source.id} 是 http 地址，本来就是只读`);
      if (source.policy === 'catalog-only') {
        return { source, changed: false, text: `已经是只读：${source.label}（${source.url}）` };
      }
      const next = await sources.readOnly(source.id);
      return {
        source: next,
        changed: true,
        text: `已把「${source.label}」设为只读（${source.url}）—— 发布不会再落到它。`,
      };
    },
  };

  return [
    tools.register(listTool),
    tools.register(installTool),
    tools.register(updateTool),
    tools.register(uninstallTool),
    tools.register(installBundleTool),
    tools.register(updateDependencyTool),
    tools.register(updatePluginTool),
    tools.register(uninstallPluginTool),
    tools.register(updateWorkbenchTool),
    tools.register(marketSourcesTool(sources === undefined ? undefined : () => sources.read())),
    tools.register(enableTool),
    tools.register(readOnlyTool),
  ];
}
