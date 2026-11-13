import type { ToolDefinition, ToolRunContext } from '../../contract/module-context.js';
import type { FlowHost } from './kit.js';
import type { FlowActionRegistry, FlowDefinition } from './types.js';
import type {
  LongTaskBase,
  LongTaskHost,
  LongTaskRegistry,
} from '../long-task.js';
import { flowTaskDeps, startFlow } from './task.js';
import { flowTool } from './tool.js';

/** 起一条流程任务：工作区必填，`input` 给流程，`session` 可选。 */
export interface FlowTaskStartOptions {
  readonly workspace: string;
  readonly input?: unknown;
  readonly session?: string | null | undefined;
}

/** 一条流程任务的三个面：注册表、`start`、与它共用同一实现的工具。 */
export interface FlowTask {
  readonly runs: LongTaskRegistry<LongTaskBase>;
  start(options: FlowTaskStartOptions): LongTaskBase;
  readonly tool: ToolDefinition;
}

/** `createFlowTask` 的入参：流程、动作、两个 host，以及工具的名字与说明。 */
export interface CreateFlowTaskOptions {
  readonly key: string;
  readonly flow: FlowDefinition;
  readonly actions: FlowActionRegistry;
  readonly flowHost: FlowHost;
  readonly longTasks: LongTaskHost;
  readonly tool: {
    readonly name: string;
    readonly description: string;
  };
  readonly workspaceOf?: ((exec: ToolRunContext | undefined) => string | null) | undefined;
  readonly sessionOf?: ((exec: ToolRunContext | undefined) => string | null) | undefined;
}

/**
 * 校验流程、建长任务注册表、给出 `start` 与工具；失败直接抛，不建半截注册表。
 * @param options 流程、动作、`flow` / `longTasks` host 与工具文案。
 * @returns 注册表、`start` 与 `ToolDefinition`。
 */
export function createFlowTask(options: CreateFlowTaskOptions): FlowTask {
  const checked = options.flowHost.check(options.flow, options.actions);
  if (!checked.ok) {
    throw new Error(
      `流程定义有问题：${checked.problems.map((one) => `${one.path}: ${one.problem}`).join('；')}`,
    );
  }

  const runs = options.longTasks.create<LongTaskBase>({
    key: options.key,
    ...flowTaskDeps(options.actions, options.flowHost),
  });

  return {
    runs,
    start: (startOptions) =>
      startFlow({
        runs,
        flow: options.flow,
        input: startOptions.input ?? {},
        workspace: startOptions.workspace,
        ...(startOptions.session === undefined || startOptions.session === null
          ? {}
          : { session: startOptions.session }),
      }),
    tool: flowTool({
      name: options.tool.name,
      description: options.tool.description,
      flow: options.flow,
      actions: options.actions,
      runs,
      ...(options.workspaceOf === undefined ? {} : { workspaceOf: options.workspaceOf }),
      ...(options.sessionOf === undefined ? {} : { sessionOf: options.sessionOf }),
    }),
  };
}
