import type { ToolDefinition, UnitMountDeps } from '@dsh-workbench/core/contract';
import {
  TEXT_OUTPUT,
  createFlowTask,
  recordOf,
  textOf,
  type LongTaskBase,
  type LongTaskRegistry,
} from '@dsh-workbench/shared/host';
import { LIST_LIMIT } from '../model/overview';
import { DECLARED_TOOLS } from '../declared-tools';
import { RUN_TASK, headlineOf, sampleFlow } from '../model/flow';
import { readOverview } from './overview';

export interface StartResult {
  readonly ok: boolean;
  readonly runId?: string;
  readonly status?: string;
  readonly text?: string;
  readonly code?: string;
  readonly message?: string;
}



export interface Sample {
  readonly runs: LongTaskRegistry<LongTaskBase> | undefined;
  readonly runTool: ToolDefinition;
  startFromPayload(payload: unknown): StartResult;
}

export function createSample(deps: UnitMountDeps): Sample {
  const flowDefinition = sampleFlow();
  const actions = deps.flow.createActions();
  const runDescription =
    '跑一遍样板流程（读目录 → 汇总）；只读本机目录，不写平台，不用点头；再传 runId 可只看同一趟。';

  actions.register(
    'read',
    async (_input, context) => {
      context.log('读目录');
      const payload = readOverview(context.workspace, LIST_LIMIT);
      return { files: payload.files, dirs: payload.dirs, bytes: payload.bytes };
    },
    { title: '读目录' },
  );
  actions.register(
    'summarize',
    async (input) => {
      const one = recordOf(input);
      return {
        text: `${String(one['files'])} 个文件 · ${String(one['dirs'])} 个目录 · ${String(one['bytes'])} 字节`,
      };
    },
    { title: '汇总' },
  );

  const flowTask =
    deps.longTasks === undefined
      ? undefined
      : createFlowTask({
          key: RUN_TASK,
          flow: flowDefinition,
          actions,
          flowHost: deps.flow,
          longTasks: deps.longTasks,
          tool: { name: DECLARED_TOOLS.run.name, description: runDescription },
        });
  const runs = flowTask?.runs;

  const start = (workspace: string, session: string | null): StartResult => {
    if (flowTask === undefined) return { ok: false, text: '外壳没有给长任务服务：这一版起不了流程' };
    const run = flowTask.start({
      workspace,
      input: { path: workspace },
      ...(session === null ? {} : { session }),
    });
    return { ok: true, runId: run.id, status: run.status, text: headlineOf(run) };
  };

  const runTool: ToolDefinition = flowTask?.tool ?? {
    name: DECLARED_TOOLS.run.name,
    description: runDescription,
    parameters: { type: 'object', properties: {}, additionalProperties: true },
    output: TEXT_OUTPUT,
    async execute() {
      return { ok: false, text: '外壳没有给长任务服务：这一版起不了流程' };
    },
  };

  return {
    runs,
    runTool,
    startFromPayload(payload: unknown): StartResult {
      const path = textOf(recordOf(payload)['path']);
      if (path === '') {
        return { ok: false, code: 'no-path', message: '没告诉我要跑哪个目录', text: '先打开一个项目再跑。' };
      }
      return start(path, null);
    },
  };
}
