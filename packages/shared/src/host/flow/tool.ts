import type { ToolDefinition, ToolRunContext } from '../../contract/module-context.js';
import { TEXT_OUTPUT, sessionIdOf, sessionWorkspace } from '../tool-kit.js';
import type { FlowActionRegistry, FlowDefinition } from './types.js';
import type { LongTaskBase, LongTaskRegistry } from '../long-task.js';
import { startFlow } from './task.js';

function recordOf(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function renderRun(flowId: string, snapshot: LongTaskBase): string {
  const step = snapshot.step === '' ? '排队中' : snapshot.step;
  return [`流程 ${flowId} · ${snapshot.status} · ${step}`, ...snapshot.steps.slice(-5)].join('\n');
}

/** 流程工具的入参：名字、说明、流程、动作、注册表与可选的会话取法。 */
export interface FlowToolOptions {
  readonly name: string;
  readonly description: string;
  readonly flow: FlowDefinition;
  readonly actions: FlowActionRegistry;
  readonly runs: LongTaskRegistry<LongTaskBase>;
  readonly workspaceOf?: ((exec: ToolRunContext | undefined) => string | null) | undefined;
  readonly sessionOf?: ((exec: ToolRunContext | undefined) => string | null) | undefined;
}

/** 把一条流程包成 agent 工具：不带 runId 起一条，带 runId 只看那条。 */
export function flowTool(options: FlowToolOptions): ToolDefinition {
  const workspaceOf = options.workspaceOf ?? sessionWorkspace;
  const sessionOf = options.sessionOf ?? sessionIdOf;

  return {
    name: options.name,
    description: options.description,
    parameters: {
      type: 'object',
      properties: {
        input: {
          type: 'object',
          description: '流程输入；形状见流程说明。',
          additionalProperties: true,
        },
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
        const snapshot = options.runs.snapshot(runId);
        if (snapshot === null) return { ok: false, text: `没有这条 run：${runId}` };
        return {
          ok: true,
          runId,
          status: snapshot.status,
          text: renderRun(options.flow.id, snapshot),
        };
      }

      const workspace = workspaceOf(exec);
      if (workspace === null) return { ok: false, text: '这个会话没有工作区。' };

      const session = sessionOf(exec);
      const started = startFlow({
        runs: options.runs,
        flow: options.flow,
        input: args['input'] ?? {},
        workspace,
        ...(session === null ? {} : { session }),
      });
      return {
        ok: true,
        runId: started.id,
        status: started.status,
        text: renderRun(options.flow.id, started),
      };
    },
  };
}
