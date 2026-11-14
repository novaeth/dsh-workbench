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

/**
 * 建一份无状态的流程宿主 kit。
 * @param agents 宿主的 agent 端口；没有（这一份运行时没装 subagents）就不支持 agent 节点。
 * @returns `createActions` / `check` / `run`。
 */
export function createFlowHost(agents?: FlowAgentPort, ai?: AiPort): FlowHost {
  return {
    createActions: () => createFlowActionRegistry(),
    check: (flow, actions, options) =>
      checkFlow(flow, actions, {
        agents: options?.agents ?? agents !== undefined,
        ai: options?.ai ?? (ai !== undefined && ai.supports('text')),
      }),
    run: (options) => runWithAgents({ ...options, ...(ai === undefined ? {} : { ai }) }, agents),
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
