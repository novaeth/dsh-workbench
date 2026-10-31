import type { DshToolDefinition, UnitMountDeps } from '@dsh-workbench/core/contract';
import {
  TEXT_OUTPUT,
  longTaskStepOf,
  recordOf,
  sessionIdOf,
  sessionWorkspace,
  textOf,
  type LongTaskBase,
  type LongTaskRegistry,
} from '@dsh-workbench/shared/host';
import { LIST_LIMIT } from '../model/overview';
import { DECLARED_TOOLS } from '../declared-tools';
import { FLOW_TARGET, RUN_TASK, headlineOf, sampleFlow } from '../model/flow';
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
  readonly runTool: DshToolDefinition;
  startFromPayload(payload: unknown): StartResult;
}

export function createSample(deps: UnitMountDeps): Sample {
  const flowDefinition = sampleFlow();
  const actions = deps.flow.createActions();

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

  const checked = deps.flow.check(flowDefinition, actions);
  if (!checked.ok) {
    throw new Error(
      `流程定义有问题：${checked.problems.map((one) => `${one.path}: ${one.problem}`).join('；')}`,
    );
  }

  const runs = deps.longTasks?.create<LongTaskBase>({
    key: RUN_TASK,
    run: async ({ payload, onStep, signal }) => {
      const path = textOf(recordOf(payload)['path']);
      const result = await deps.flow.run({
        flow: flowDefinition,
        input: { path },
        actions,
        signal,
        runId: `${DECLARED_TOOLS.run.name}-${String(Date.now())}`,
        workspace: path,
        onStep: (event) => {
          onStep(longTaskStepOf(event));
        },
      });
      if (result.status === 'failed') {
        throw result.error instanceof Error
          ? result.error
          : new Error(`流程失败在 ${result.failedStep ?? '未知步骤'}`);
      }
      return result;
    },
    step: (step) => ({ step: step.text }),
    outcome: () => ({ step: '完成：读目录 → 汇总' }),
    stopped: (current) => ({ step: current.step === '' ? '已停止' : `停在「${current.step}」` }),
    view: (snapshot) => ({
      status: snapshot.status,
      step: snapshot.step,
      steps: snapshot.steps,
      ...(snapshot.why === undefined ? {} : { why: snapshot.why }),
    }),
  });

  const start = (workspace: string, session: string | null): StartResult => {
    if (runs === undefined) return { ok: false, text: '外壳没有给长任务服务：这一版起不了流程' };
    const run = runs.start({
      workspace,
      target: FLOW_TARGET,
      payload: { path: workspace },
      ...(session === null ? {} : { session }),
    });
    return { ok: true, runId: run.id, status: run.status, text: headlineOf(run) };
  };

  const runTool: DshToolDefinition = {
    name: DECLARED_TOOLS.run.name,
    description:
      '跑一遍样板流程（读目录 → 汇总）；只读本机目录，不写平台，不用点头；再传 runId 可只看同一趟。',
    parameters: {
      type: 'object',
      properties: {
        runId: {
          type: 'string',
          description: '填上一次的 runId = 只看那条；不填 = 起一条新的。',
        },
      },
      additionalProperties: false,
    },
    output: TEXT_OUTPUT,
    async execute(raw, exec) {
      const args = recordOf(raw);
      const runId = textOf(args['runId']);
      if (runId !== '') {
        const snapshot = runs?.snapshot(runId) ?? null;
        if (snapshot === null) return { ok: false, text: `没有这条 run：${runId}` };
        return { ok: true, runId, status: snapshot.status, text: headlineOf(snapshot) };
      }
      const workspace = sessionWorkspace(exec);
      if (workspace === null || workspace === '') {
        return { ok: false, text: '这个会话没有工作区：先打开一个项目再跑。' };
      }
      return start(workspace, sessionIdOf(exec));
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
