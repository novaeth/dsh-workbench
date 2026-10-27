import type {
  DshHostContext,
  DshToolDefinition,
  DshToolRegistry,
  DshToolRunContext,
} from '@dsh-workbench/shared';
import type { LongTaskBase, LongTaskRegistry } from '@dsh-workbench/shared/host';
import { sessionIdOf, sessionWorkspace } from '@dsh-workbench/shared/host';
import { LONG_TASKS_LIST_TOOL, LONG_TASKS_STOP_TOOL } from '../unit';

export type LongTaskRunsLookup = () => ReadonlyMap<string, LongTaskRegistry<LongTaskBase>>;

const STATUS_WORDS: Readonly<Record<string, string>> = {
  running: '进行中',
  'needs-login': '要登录',
  stopped: '被停了',
  ok: '已完成',
  failed: '出错',
};

const NO_WORKSPACE = '不知道当前会话在哪个工作区 —— 长任务按工作区记，这条读不了。';

const NO_RUNS = '这个工作区现在没有长任务在跑（也没有十分钟内刚收尾的）。';

const NO_RUN = '没有这一趟 —— unit/id 对不上。';

const STALE_REGISTRY = '这一份工作台还是上一版的注册表，停不了 —— 重新起一下工作台就能停';

const LIST_OUTPUT = {
  schema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      runs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            unit: { type: 'string' },
            id: { type: 'string' },
            target: { type: 'string' },
            status: { type: 'string' },
          },
          additionalProperties: true,
        },
      },
    },
    additionalProperties: true,
  },
  render: (_args: unknown, value: unknown) => [
    {
      type: 'text',
      text:
        typeof (value as { text?: unknown } | null)?.text === 'string'
          ? (value as { text: string }).text
          : JSON.stringify(value),
    },
  ],
};

const STOP_OUTPUT = {
  schema: {
    type: 'object',
    properties: { text: { type: 'string' }, stopped: { type: 'boolean' } },
    additionalProperties: true,
  },
  render: (_args: unknown, value: unknown) => [
    {
      type: 'text',
      text:
        typeof (value as { text?: unknown } | null)?.text === 'string'
          ? (value as { text: string }).text
          : JSON.stringify(value),
    },
  ],
};

interface ListedRun {
  readonly unit: string;
  readonly id: string;
  readonly target: string;
  readonly status: string;
  readonly step: string;
  readonly session: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function arg(raw: unknown, key: string): string {
  return str(typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)[key] : undefined);
}

function statusWord(status: string): string {
  return STATUS_WORDS[status] ?? status;
}

function originOf(session: string, caller: string | null): string {
  if (session === '') return '用户按的';
  return session === caller ? '我起的' : '别的会话起的';
}

function listed(runs: LongTaskRunsLookup | undefined, workspace: string): readonly ListedRun[] {
  const out: ListedRun[] = [];
  for (const [unit, registry] of runs?.() ?? []) {
    for (const row of registry.current(workspace)) {
      const id = str(row['id']);
      const run = id === '' ? null : registry.snapshot(id);
      out.push({
        unit,
        id,
        target: str(row['target']) || str(run?.target),
        status: str(row['status']) || str(run?.status),
        step: str(row['step']) || str(row['why']) || str(run?.step) || str(run?.why),
        session: str(row['session']) || str(run?.session),
      });
    }
  }
  return out;
}

function lineOf(run: ListedRun, index: number, caller: string | null): string {
  const parts = [
    run.unit,
    run.target,
    statusWord(run.status),
    run.step,
    run.id === '' ? '' : `id=${run.id}`,
    originOf(run.session, caller),
  ];
  return `${String(index + 1)}. ${parts.filter((part) => part !== '').join(' · ')}`;
}

function renderList(runs: readonly ListedRun[], workspace: string, caller: string | null): string {
  if (runs.length === 0) return NO_RUNS;
  return [
    `当前工作区：${workspace}`,
    ...runs.map((run, index) => lineOf(run, index, caller)),
  ].join('\n');
}

export function registerLongTaskTools(
  ctx: DshHostContext,
  longTaskRuns?: LongTaskRunsLookup | undefined,
): Array<() => void> {
  const tools = ctx.get<DshToolRegistry>('tools');
  if (tools === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 没有 tools 服务，跳过外壳长任务工具注册');
    return [];
  }

  const listTool: DshToolDefinition = {
    name: LONG_TASKS_LIST_TOOL,
    description:
      '看这个工作区在跑（十分钟内也算）的长任务：每行是 模块 · 目标 · 状态 · 这一步 · id · 谁起的；' +
      '要停就调 workbench_long_tasks_stop。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: LIST_OUTPUT,
    async execute(_raw: unknown, exec: DshToolRunContext) {
      const workspace = sessionWorkspace(exec);
      if (workspace === null) return { runs: [], text: NO_WORKSPACE };
      const runs = listed(longTaskRuns, workspace);
      return { runs, text: renderList(runs, workspace, sessionIdOf(exec)) };
    },
  };

  const stopTool: DshToolDefinition = {
    name: LONG_TASKS_STOP_TOOL,
    description:
      '停掉某一趟长任务（unit 与 id 从 workbench_long_tasks_list 拿）。只是让外壳给它发中断信号，' +
      '平台侧那趟活儿的收尾看模块自己。',
    parameters: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: '那一趟属于的单元 id（如 inventory）。' },
        id: { type: 'string', description: '那一趟的 id（列表里 id= 后面那串）。' },
      },
      required: ['unit', 'id'],
      additionalProperties: false,
    },
    output: STOP_OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const unit = arg(raw, 'unit');
      const id = arg(raw, 'id');
      if (unit === '' || id === '') return { text: NO_RUN, stopped: false };
      const registry = longTaskRuns?.().get(unit);
      if (registry === undefined || typeof registry.stop !== 'function') {
        return { text: registry === undefined ? NO_RUN : STALE_REGISTRY, stopped: false };
      }
      const run = registry.snapshot(id);
      if (run === null) return { text: NO_RUN, stopped: false };
      if (run.workspace !== sessionWorkspace(exec)) {
        return { text: `这一趟不在你当前的工作区（它在 ${run.workspace}）—— 没动它。`, stopped: false };
      }
      if (!registry.stop(id, sessionIdOf(exec) ?? undefined)) {
        return { text: `这一趟已经不在跑了（${statusWord(run.status)}）—— 没动它。`, stopped: false };
      }
      return {
        text: `停了：${unit} · ${run.target}（${id}）。这一趟的活儿收到中断信号 —— 它认不认、停在哪一步看它自己。`,
        stopped: true,
      };
    },
  };

  return [tools.register(listTool), tools.register(stopTool)];
}
