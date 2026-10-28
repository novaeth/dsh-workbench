import { checkFlow } from './check.js';
import { createFlowActionRegistry, runFlow } from './run.js';
import type {
  FlowActionRegistry,
  FlowCheck,
  FlowDefinition,
  FlowResult,
  FlowRunOptions,
} from './types.js';

/**
 * 流程引擎的宿主 kit：模块从 `mount(deps).flow` 拿，不直接 import shared。
 */
export interface FlowHost {
  createActions(): FlowActionRegistry;
  check(flow: FlowDefinition, actions: Pick<FlowActionRegistry, 'has'>): FlowCheck;
  run(options: FlowRunOptions): Promise<FlowResult>;
}

/**
 * 建一份无状态的流程宿主 kit。
 * @returns `createActions` / `check` / `run`。
 */
export function createFlowHost(): FlowHost {
  return {
    createActions: () => createFlowActionRegistry(),
    check: (flow, actions) => checkFlow(flow, actions),
    run: (options) => runFlow(options),
  };
}
