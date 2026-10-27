import type { ApprovalCall, ApprovalDetail, ApprovalPolicy, ApprovalVerdict, RecordState } from '@dsh-workbench/shared/host';
import {
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_DEBUG_STOP_TOOL,
  DIY_TOOLS,
  LONG_TASKS_STOP_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UPDATE_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
  MARKET_ENABLE_TOOL,
  MARKET_DISABLE_TOOL,
  PANELS_FOLLOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_SHOW_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  DIY_PUBLISH_TOOL,
} from '../unit';
import type { MarketSourceConfig, PublishPreview } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { MarketSourcesStore } from '@/shared/api/host/market-sources-store';
import type { LongTaskRunsLookup } from './long-task-tools';
import { recordRefusalText } from './diy-record-text';

const SPEC_LIMIT = 80;

const TARGET_LIMIT = 20;

interface Pair {
  readonly zh: string;
  readonly en: string;
}

function missing(id: string | undefined): boolean {
  return id === undefined || id === '';
}

function pad(token: string): string {
  return token.startsWith('[') ? ` ${token} ` : token;
}

function pair(zh: string, en: string): ApprovalDetail {
  return { zh, en };
}

function workbenchModule(id: string | undefined): Pair {
  return missing(id)
    ? { zh: '工作台模块', en: 'the workbench module' }
    : { zh: `工作台${pad(`[${id}]`)}模块`, en: `the workbench [${id}] module` };
}

function workbenchPlugin(id: string | undefined): Pair {
  return missing(id)
    ? { zh: '工作台的 opencli 插件', en: 'a workbench opencli plugin' }
    : { zh: `工作台${pad(`[${id}]`)}opencli 插件`, en: `the workbench [${id}] opencli plugin` };
}

function workbenchDependency(id: string | undefined): Pair {
  return missing(id)
    ? { zh: '工作台共用依赖', en: 'a workbench shared dependency' }
    : { zh: `工作台共用依赖 [${id}]`, en: `the workbench shared dependency [${id}]` };
}

function workbenchPanelRow(id: string | undefined): Pair {
  return missing(id)
    ? { zh: '工作台在当前项目的面板', en: "the workbench panel for this project" }
    : { zh: `工作台${pad(`[${id}]`)}模块这一行`, en: `the workbench [${id}] module row` };
}

function specOf(raw: Record<string, unknown>): string {
  const spec = typeof raw['spec'] === 'string' ? raw['spec'].replace(/\s+/g, ' ').trim() : '';
  if (spec === '') return '';
  return spec.length > SPEC_LIMIT ? `${spec.slice(0, SPEC_LIMIT)}…` : spec;
}

function boardName(scope: string | undefined): Pair {
  return scope === 'machine'
    ? { zh: '机器级默认板', en: 'the machine-level board' }
    : { zh: '当前项目的面板', en: "this project's panel" };
}

function argsOf(call: ApprovalCall): Record<string, unknown> {
  const raw = call.arguments;
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
}

function askOf(reason: string, question: ApprovalDetail, fallback: ApprovalDetail): ApprovalVerdict {
  return { kind: 'ask', reason, question, fallback };
}

function textOf(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === 'string' ? value.trim() : '';
}

function clipped(text: string): string {
  const chars = [...text];
  return chars.length > TARGET_LIMIT ? `${chars.slice(0, TARGET_LIMIT).join('')}…` : text;
}

function stopVerdict(call: ApprovalCall, runs: LongTaskRunsLookup | undefined): ApprovalVerdict {
  const raw = argsOf(call);
  const unit = textOf(raw, 'unit');
  const id = textOf(raw, 'id');
  if (unit === '' || id === '') return { kind: 'allow' };
  const run = runs?.().get(unit)?.snapshot(id) ?? null;
  if (runs !== undefined && run === null) return { kind: 'allow' };
  const session = run?.session ?? '';
  if (session !== '' && session === call.session) return { kind: 'allow' };
  const target = run === null ? '' : run.target.trim();
  const where =
    target === ''
      ? `工作台 [${unit}] 那一趟长任务`
      : `工作台 [${unit}] 那一趟「${clipped(target)}」长任务`;
  const whereEn =
    target === ''
      ? `a long-running workbench job [${unit}]`
      : `a long-running workbench job [${unit}] "${clipped(target)}"`;
  const origin = session === '' ? '用户自己按的' : '别的会话起的';
  const originEn = session === '' ? 'the user started' : 'another session started';
  return askOf(
    `${LONG_TASKS_STOP_TOOL} ${unit} stops a long run someone else started`,
    pair(`会停掉${where}，${origin}，允许吗？`, `it stops ${whereEn} ${originEn}. Allow?`),
    pair(
      `agent 想停掉${where}，${origin}，允许吗？`,
      `The agent wants to stop ${whereEn} ${originEn}. Allow?`,
    ),
  );
}

export type PublishApprovalPreview = PublishPreview;

function publishVerdict(
  call: ApprovalCall,
  preview?: (unit: string, author?: string) => PublishApprovalPreview | null,
): ApprovalVerdict {
  const raw = argsOf(call);
  if (raw['verify'] === true || raw['target'] === 'local') return { kind: 'allow' };
  const refresh = raw['refresh'] === true;
  const unit = textOf(raw, 'unit');
  const askedAuthor = textOf(raw, 'author');
  const found = unit === '' ? null : (preview?.(unit, askedAuthor === '' ? undefined : askedAuthor) ?? null);
  const asked = textOf(raw, 'target');
  const target = refresh
    ? 'market'
    : asked === ''
      ? found?.market === undefined
        ? found?.registry === undefined
          ? 'tarball'
          : 'team'
        : 'market'
      : asked;
  const source = textOf(raw, 'source');
  if (found?.claim?.state === 'conflict' && source === '' && target !== 'tarball' && target !== 'local') {
    return {
      kind: 'deny',
      reason:
        `市场里 ${found.name} 已经有主了（${found.claim.owner}）—— 同一个名字不能换人发。` +
        '换一个带团队 scope 的包名；你就是原来的作者（只是换了机器或署名），用 author 参数带上原来的署名；' +
        '确实是接手，让索引维护者改 market.json 里这一条的 owner。',
    };
  }
  const label = unit === '' ? '工作台模块' : `工作台模块 [${unit}]`;
  const labelEn = unit === '' ? 'the workbench module' : `the workbench module [${unit}]`;
  if (!refresh && found?.changelog?.missing === true && textOf(raw, 'changelogNote') === '') {
    return {
      kind: 'deny',
      reason:
        `这一版还没有更新日志（${found.changelog.version}）—— 带上 changelogNote（一行一条）再调，` +
        '发布时会一起写进 CHANGELOG.md 并随包发',
    };
  }
  const copies: Record<string, { zh: string; en: string }> = {
    team: {
      zh: `把${label}发到团队源，只发构建产物，不发源码，允许吗？`,
      en: `Publish ${labelEn} to the team registry; only built artifacts, never the source. Allow?`,
    },
    public: {
      zh: `把${label}公开发到 npm，任何人都能安装，允许吗？`,
      en: `Publish ${labelEn} publicly to npm; anyone can install it. Allow?`,
    },
    tarball: {
      zh: `给${label}打一个安装包，只写本机不发源码，允许吗？`,
      en: `Pack ${labelEn} into a local tarball; nothing leaves this machine. Allow?`,
    },
    git: {
      zh: `把${label}提交并推到 git，源码也会一起推送，允许吗？`,
      en: `Commit and push ${labelEn} to git; the source is pushed too. Allow?`,
    },
    market: {
      zh: `把${label}发到市场仓库，产物与索引一起提交，允许吗？`,
      en: `Publish ${labelEn} to the market repository; artifacts and the index are committed together. Allow?`,
    },
    local: {
      zh: `把${label}留在本机，不发，允许吗？`,
      en: `Keep ${labelEn} local and publish nothing. Allow?`,
    },
  };
  const copy = copies[target] ?? copies['team'];
  const targetLabel =
    found === null
      ? target
      : target === 'market' && found.market !== undefined
        ? `${found.name}@${found.version} → market (${found.market.url})`
        : `${found.name}@${found.version} → ${target}${found.registry === undefined ? '' : ` (${found.registry})`}`;
  const question = refresh
    ? pair(
        `只刷新${label}在市集里的元数据（标题 / 作者 / 说明），不升版本、不重发产物，允许吗？`,
        `Only refresh ${labelEn}'s market metadata (title, author, description); no version bump, no artifacts. Allow?`,
      )
    : pair(copy.zh, copy.en);
  return askOf(`${DIY_PUBLISH_TOOL} ${targetLabel}${refresh ? '（元数据）' : ''}`, question, question);
}

export type MarketSourceLookup = (id: string | undefined) => MarketSourceConfig | undefined;

function approvalVerdict(call: ApprovalCall, marketSource?: MarketSourceLookup): ApprovalVerdict | undefined {
  if (call.name === LONG_TASKS_STOP_TOOL) return stopVerdict(call, undefined);
  if (call.name === DIY_PUBLISH_TOOL) return publishVerdict(call);
  if (call.name === DIY_DEBUG_START_TOOL || call.name === DIY_DEBUG_RESUME_TOOL) {
    const starting = call.name === DIY_DEBUG_START_TOOL;
    const unit = argsOf(call)['unit'];
    const target = typeof unit === 'string' && unit !== '' ? ` [${unit}]` : '';
    return askOf(
      `${call.name}${target} takes over the user's screen to debug a workbench module`,
      pair(
        starting
          ? '要在这个工作区的那块板上开始调试 —— 调试中请留在那一屏，允许吗？'
          : '要接着调试 —— 请回到那一屏，允许吗？',
        starting
          ? "it takes over your screen to debug on this workspace's board — please stay on that screen. Allow?"
          : 'it needs your screen again to keep debugging — please go back to that screen. Allow?',
      ),
      pair(
        starting
          ? 'agent 要占用你的屏幕开始调试工作台模块，允许吗？'
          : 'agent 要接着占用你的屏幕，继续调试工作台模块，允许吗？',
        starting
          ? 'The agent wants to take over your screen to start debugging a workbench module. Allow?'
          : 'The agent wants your screen again to keep debugging a workbench module. Allow?',
      ),
    );
  }
  if (call.name === DIY_DEBUG_PAUSE_TOOL || call.name === DIY_DEBUG_STOP_TOOL) {
    return { kind: 'allow' };
  }
  if (call.name === DIY_RECORD_PREPARE_TOOL) {
    const raw = argsOf(call);
    const asked = typeof raw['url'] === 'string' ? raw['url'].replace(/\s+/g, ' ').trim() : '';
    const act = typeof raw['doing'] === 'string' ? raw['doing'].replace(/\s+/g, ' ').trim() : '';
    const title = pair('申请录制调试', 'Request recording a debug session');
    return askOf(
      `${DIY_RECORD_PREPARE_TOOL} opens a browser window in front on ${asked} to record one real write` +
        (act === '' ? '' : ` (${act})`),
      title,
      title,
    );
  }
  if (call.name !== undefined && (DIY_TOOLS as readonly string[]).includes(call.name)) {
    return { kind: 'allow' };
  }
  const raw = argsOf(call);
  const text = (key: string): string | undefined => {
    const value = raw[key];
    return typeof value === 'string' && value !== '' ? value : undefined;
  };
  const id = text('id') ?? text('unit');
  const plugin = text('plugin');
  const spec = specOf(raw);
  const scope = text('scope');
  const board = boardName(scope);

  switch (call.name) {
    case PANELS_SHOW_TOOL: {
      const row = workbenchPanelRow(id);
      return askOf(
        `${PANELS_SHOW_TOOL} ${id ?? ''} puts a workbench module row on this project's board`,
        pair(`会把${row.zh}加回${board.zh}，允许吗？`, `it puts ${row.en} back on ${board.en}. Allow?`),
        pair(`agent 想把${row.zh}加到${board.zh}，允许吗？`, `The agent wants to put ${row.en} on ${board.en}. Allow?`),
      );
    }
    case PANELS_HIDE_TOOL: {
      const row = workbenchPanelRow(id);
      return askOf(
        `${PANELS_HIDE_TOOL} ${id ?? ''} takes a workbench module row off this project's board`,
        pair(
          `会把${row.zh}从${board.zh}上收起，允许吗？`,
          `it takes ${row.en} off ${board.en} — its card and its tools go too. Allow?`,
        ),
        pair(
          `agent 想把${row.zh}收起，允许吗？`,
          `The agent wants to take ${row.en} off the board. Allow?`,
        ),
      );
    }
    case PANELS_MOVE_TOOL: {
      const row = workbenchPanelRow(id);
      return askOf(
        `${PANELS_MOVE_TOOL} ${id ?? ''} reorders the workbench panel`,
        pair(`会把${row.zh}移到${board.zh}最前面，允许吗？`, `it moves ${row.en} to the front of ${board.en}. Allow?`),
        pair(`agent 想把${row.zh}移到最前面，允许吗？`, `The agent wants to move ${row.en} to the front. Allow?`),
      );
    }
    case PANELS_RESET_TOOL:
      return askOf(
        `${PANELS_RESET_TOOL} clears the rows this project changed on the workbench panel`,
        pair(
          scope === 'machine' ? '会清空工作台那份机器级默认板，允许吗？' : '会清空工作台在当前项目的面板，允许吗？',
          `it clears the rows this project changed on the workbench ${board.en}. Allow?`,
        ),
        pair(
          scope === 'machine'
            ? 'agent 想清空工作台那份机器级默认板，允许吗？'
            : 'agent 想清空工作台在当前项目的面板，允许吗？',
          `The agent wants to clear this project's rows on the workbench ${board.en}. Allow?`,
        ),
      );
    case PANELS_FOLLOW_TOOL: {
      const row = workbenchPanelRow(id);
      return askOf(
        `${PANELS_FOLLOW_TOOL} ${id ?? ''} puts a workbench panel row back to following the machine-level board`,
        pair(`会把${row.zh}改回跟随机器级默认板，允许吗？`, `it puts ${row.en} back to following the machine-level board. Allow?`),
        pair(`agent 想把${row.zh}改回跟随机器级默认板，允许吗？`, `The agent wants to put ${row.en} back to following the machine-level board. Allow?`),
      );
    }
    case MODULES_INSTALL_TOOL:
    case MODULES_UPDATE_TOOL: {
      const install = call.name === MODULES_INSTALL_TOOL;
      const verb = install ? '装' : '升';
      const verbEn = install ? 'installs' : 'upgrades';
      return askOf(
        `${call.name} ${id ?? ''} changes the opencli plugins and libraries a workbench module declares`,
        pair(
          `会${verb}${workbenchModule(id).zh}要的插件与库，不换模块包本身，允许吗？`,
          `it ${verbEn} the plugins the ${workbenchModule(id).en} declares, without replacing its package. Allow?`,
        ),
        pair(
          `agent 想${verb}${workbenchModule(id).zh}要的插件与库，允许吗？`,
          `The agent wants to ${install ? 'install' : 'upgrade'} the plugins ${workbenchModule(id).en} declares. Allow?`,
        ),
      );
    }
    case MODULES_UNINSTALL_TOOL: {
      const target = workbenchModule(id);
      return askOf(
        `${MODULES_UNINSTALL_TOOL} ${id ?? ''} removes a workbench module from this machine`,
        pair(`会把${target.zh}连它的包一起卸掉，允许吗？`, `it uninstalls ${target.en}, package included. Allow?`),
        pair(`agent 想卸载${target.zh}，允许吗？`, `The agent wants to uninstall ${target.en}. Allow?`),
      );
    }
    case MODULES_INSTALL_BUNDLE_TOOL:
      return askOf(
        `${MODULES_INSTALL_BUNDLE_TOOL} ${spec} installs a module package into this profile`,
        pair(`会把 [${spec}] 装成工作台的模块包，允许吗？`, `it installs [${spec}] as a workbench module package. Allow?`),
        pair(`agent 想装工作台的模块包 [${spec}]，允许吗？`, `The agent wants to install the workbench module package [${spec}]. Allow?`),
      );
    case MODULES_UPDATE_DEPENDENCY_TOOL: {
      const target = workbenchDependency(id);
      return askOf(
        `${MODULES_UPDATE_DEPENDENCY_TOOL} ${id ?? ''} upgrades a shared dependency on this machine`,
        pair(`会升级${target.zh}，允许吗？`, `it upgrades ${target.en}. Allow?`),
        pair(`agent 想升级${target.zh}，允许吗？`, `The agent wants to upgrade ${target.en}. Allow?`),
      );
    }
    case MODULES_UPDATE_PLUGIN_TOOL: {
      const target = workbenchPlugin(plugin);
      return askOf(
        `${MODULES_UPDATE_PLUGIN_TOOL} ${plugin ?? ''} updates an opencli plugin on this machine`,
        pair(`会更新${target.zh}，允许吗？`, `it updates ${target.en}. Allow?`),
        pair(`agent 想更新${target.zh}，允许吗？`, `The agent wants to update ${target.en}. Allow?`),
      );
    }
    case MODULES_UNINSTALL_PLUGIN_TOOL: {
      const target = workbenchPlugin(plugin);
      return askOf(
        `${MODULES_UNINSTALL_PLUGIN_TOOL} ${plugin ?? ''} uninstalls an opencli plugin on this machine`,
        pair(`会卸载${target.zh}，允许吗？`, `it uninstalls ${target.en}. Allow?`),
        pair(`agent 想卸载${target.zh}，允许吗？`, `The agent wants to uninstall ${target.en}. Allow?`),
      );
    }
    case MODULES_UPDATE_WORKBENCH_TOOL:
      return askOf(
        `${MODULES_UPDATE_WORKBENCH_TOOL} replaces the workbench itself with the new version from the registry`,
        pair('会把工作台本身更新到源上的新版，允许吗？', 'it updates the workbench itself to the new version from the registry. Allow?'),
        pair('agent 想把工作台本身更新到源上的新版，允许吗？', 'The agent wants to update the workbench itself from the registry. Allow?'),
      );
    case MARKET_ENABLE_TOOL: {
      const id = text('id');
      const source = marketSource?.(id);
      if (marketSource !== undefined && source === undefined) {
        return {
          kind: 'deny',
          reason:
            id === undefined
              ? '这台机器上还没有选中的索引源 —— 先在「模块市场 → 发现」里添加并选中一个'
              : `没有这个索引源：${id}`,
        };
      }
      if (source !== undefined && source.policy === 'artifacts-in-repo') return { kind: 'allow' };
      if (source !== undefined && source.kind === 'http') {
        return { kind: 'deny', reason: 'http 索引源只能读，不能当发布目的地' };
      }
      const where =
        source === undefined
          ? {
              zh: id === undefined ? '工作台当前选中的索引源' : `工作台的索引源「${id}」`,
              en: id === undefined ? 'the selected workbench index source' : `the workbench index source "${id}"`,
            }
          : {
              zh: `工作台的索引源「${source.label}」`,
              en: `the workbench index source "${source.label}"`,
            };
      return askOf(
        `${MARKET_ENABLE_TOOL}${source === undefined ? '' : ` ${source.url}`} marks a market index source as a publish destination on this machine`,
        pair(`把${where.zh}设为可发布，允许吗？`, `Make ${where.en} a publish destination. Allow?`),
        pair(
          `会把${where.zh}设为可发布，只改本机配置，不碰仓库，允许吗？`,
          `It makes ${where.en} a publish destination on this machine, without touching the repository. Allow?`,
        ),
      );
    }
    case MARKET_DISABLE_TOOL: {
      const id = text('id');
      const source = marketSource?.(id);
      if (marketSource !== undefined && source === undefined) {
        return {
          kind: 'deny',
          reason:
            id === undefined
              ? '这台机器上还没有选中的索引源 —— 先在「模块市场 → 发现」里添加并选中一个'
              : `没有这个索引源：${id}`,
        };
      }
      if (source === undefined) {
        return askOf(
          `${MARKET_DISABLE_TOOL} stops using a market index source as a publish destination on this machine`,
          pair('把工作台当前选中的索引源改回只读，允许吗？', 'Make the selected workbench index source read-only again. Allow?'),
          pair(
            '会把工作台当前选中的索引源改回只读，只改本机配置，不碰仓库，允许吗？',
            'It makes the selected workbench index source read-only again on this machine, without touching the repository. Allow?',
          ),
        );
      }
      if (source.kind !== 'git' || source.policy !== 'artifacts-in-repo') return { kind: 'allow' };
      return askOf(
        `${MARKET_DISABLE_TOOL} ${source.url} stops using a market index source as a publish destination on this machine`,
        pair(`把工作台的索引源「${source.label}」改回只读，允许吗？`, `Make the workbench index source "${source.label}" read-only again. Allow?`),
        pair(
          `会把工作台的索引源「${source.label}」改回只读，只改本机配置，不碰仓库，允许吗？`,
          `It makes the workbench index source "${source.label}" read-only again on this machine, without touching the repository. Allow?`,
        ),
      );
    }
    default:
      return undefined;
  }
}

export const panelsApproval: ApprovalPolicy = (call) => approvalVerdict(call);

function recordHeldVerdict(
  call: ApprovalCall,
  recording: (() => RecordState | null) | undefined,
): ApprovalVerdict | undefined {
  if (call.name !== DIY_RECORD_PREPARE_TOOL || recording === undefined) return undefined;
  const held = recording();
  if (held === null) return undefined;
  const code = held.sessionId === call.session ? 'already-held' : 'held-by-other';
  return { kind: 'deny', reason: recordRefusalText(code, held) };
}

export function panelsApprovalFor(
  longTaskRuns?: LongTaskRunsLookup | undefined,
  recording?: (() => RecordState | null) | undefined,
  publishPreview?: ((unit: string, author?: string) => PublishApprovalPreview | null) | undefined,
  marketSources?: MarketSourcesStore | undefined,
): ApprovalPolicy {
  const sourceOf: MarketSourceLookup | undefined =
    marketSources === undefined
      ? undefined
      : (id) => {
          const payload = marketSources.read();
          const wanted = id === undefined || id === '' ? payload.selected : id;
          return wanted === null ? undefined : payload.sources.find((one) => one.id === wanted);
        };
  return (call) => {
    if (call.name === LONG_TASKS_STOP_TOOL) return stopVerdict(call, longTaskRuns);
    if (call.name === DIY_PUBLISH_TOOL) return publishVerdict(call, publishPreview);
    return recordHeldVerdict(call, recording) ?? approvalVerdict(call, sourceOf);
  };
}
