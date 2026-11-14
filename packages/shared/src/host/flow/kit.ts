import { flowUsesAgents } from './agent.js';
import { checkFlow } from './check.js';
import { createFlowActionRegistry, runFlow } from './run.js';
import type { AiPort } from '../ai/port.js';
import type {
  FlowActionRegistry,
  FlowAgentPort,
  FlowAgentRunner,
  FlowCheck,
  FlowCheckOptions,
  FlowDataPort,
  FlowDefinition,
  FlowResult,
  FlowRunOptions,
} from './types.js';

const DEFAULT_MAX_AGENTS = 16;
const MAX_AGENTS_CEILING = 64;

/**
 * 流程引擎的宿主 kit：模块从 `mount(deps).flow` 拿，不直接 import shared。
 * 有 agent 端口时，含 agent 节点的流程会自动开一个整条 run 共用的子 agent 通道。
 */
export interface FlowHost {
  createActions(): FlowActionRegistry;
  check(
    flow: FlowDefinition,
    actions: Pick<FlowActionRegistry, 'has'>,
    options?: FlowCheckOptions,
  ): FlowCheck;
  run(options: FlowRunOptions): Promise<FlowResult>;
}

export interface FlowHostOptions {
  readonly agents?: FlowAgentPort | undefined;
  readonly ai?: AiPort | undefined;
  readonly data?: FlowDataPort | undefined;
}

function isAgentPort(value: FlowHostOptions | FlowAgentPort): value is FlowAgentPort {
  return typeof (value as { readonly open?: unknown }).open === 'function';
}

/**
 * 建一份无状态的流程宿主 kit。老的位置参数形式仍接受，新的调用方传 options。
 * @param input 宿主 options，或旧的 agent 端口。
 * @param ai 旧形式里的模型端口。
 * @param data 旧形式里的数据端口。
 * @returns `createActions` / `check` / `run`。
 */
export function createFlowHost(
  input?: FlowHostOptions | FlowAgentPort,
  ai?: AiPort,
  data?: FlowDataPort,
): FlowHost {
  const options: FlowHostOptions =
    input === undefined
      ? { ...(ai === undefined ? {} : { ai }), ...(data === undefined ? {} : { data }) }
      : isAgentPort(input)
        ? { agents: input, ...(ai === undefined ? {} : { ai }), ...(data === undefined ? {} : { data }) }
        : input;
  const { agents, ai: aiPort, data: dataPort } = options;
  return {
    createActions: () => createFlowActionRegistry(),
    check: (flow, actions, checkOptions) =>
      checkFlow(flow, actions, {
        agents: checkOptions?.agents ?? agents !== undefined,
        ai: checkOptions?.ai ?? (aiPort !== undefined && aiPort.supports('text')),
        data: checkOptions?.data ?? (dataPort !== undefined && typeof dataPort.plan === 'function'),
      }),
    run: (runOptions) =>
      runWithAgents(
        {
          ...runOptions,
          ...(aiPort === undefined ? {} : { ai: aiPort }),
          ...(dataPort === undefined ? {} : { data: dataPort }),
        },
        agents,
      ),
  };
}

async function runWithAgents(
  options: FlowRunOptions,
  agents: FlowAgentPort | undefined,
): Promise<FlowResult> {
  if (options.agentRunner !== undefined || agents === undefined || !flowUsesAgents(options.flow)) {
    return runFlow(options);
  }
  const opened = await agents.open({
    workspace: options.workspace,
    sessionId: options.sessionId,
    signal: options.signal,
  });
  const runner = withBudget(opened, options.maxAgents);
  try {
    return await runFlow({ ...options, agentRunner: runner });
  } finally {
    await runner.dispose();
  }
}

function withBudget(runner: FlowAgentRunner, maxAgents: number | undefined): FlowAgentRunner {
  const max = Math.max(
    1,
    Math.min(MAX_AGENTS_CEILING, Math.trunc(maxAgents ?? DEFAULT_MAX_AGENTS)),
  );
  let left = max;
  return {
    run(request, signal) {
      if (left <= 0) {
        return Promise.reject(new Error(`这一趟最多跑 ${max} 次 agent（这一步已经是第 ${max + 1} 次）`));
      }
      left -= 1;
      return runner.run(request, signal);
    },
    dispose: () => runner.dispose(),
  };
}
