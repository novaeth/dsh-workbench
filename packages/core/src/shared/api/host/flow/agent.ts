import { randomUUID } from 'node:crypto';
import type {
  DshAgent,
  DshAgentHandle,
  DshAgentRegistry,
  DshContentBlock,
  DshHostContext,
  DshObjectJsonSchema,
  DshSessionId,
  DshSubagentRuntime,
  FlowAgentPort,
  FlowAgentResult,
  FlowAgentRunner,
} from '@dsh-workbench/shared/host';

const SUBAGENT_PROVIDER = 'spawn';
const OWNER_PRESET = 'standard';
const OWNER_ORIGIN = 'subagent' as const;

interface ChildDenial {
  readonly matches: (name: string) => boolean;
  readonly reason: string;
}

const CHILD_DENIALS: readonly ChildDenial[] = [
  {
    matches: (name) => name === 'ask_user_question',
    reason: '流程里的 agent 节点不能问人：要人处理请写在动作步骤的 ctx.need 里。',
  },
  {
    matches: (name) =>
      name === 'subagent' ||
      name === 'subagent_fork' ||
      name === 'send_message' ||
      name === 'list_agents' ||
      name === 'wait_agent' ||
      name === 'list_subagent_models',
    reason: '流程里的 agent 节点不再委派：编排归流程，下一步写成动作步骤或另一个 agent 节点。',
  },
  {
    matches: (name) => name === 'workflow',
    reason: '流程里的 agent 节点不能自己跑 workflow：编排归流程。',
  },
  {
    matches: (name) => name === 'exit_plan_mode',
    reason: '流程里的 agent 节点没有计划审批出口。',
  },
  {
    matches: (name) => name === 'present',
    reason: '流程里的 agent 节点不能交交付件：结论写回步骤，落盘由动作步骤做。',
  },
  {
    matches: (name) => name === 'create_goal' || name === 'update_goal',
    reason: '流程里的 agent 节点不能改目标。',
  },
  {
    matches: (name) => name.startsWith('schedule_'),
    reason: '流程里的 agent 节点不能排日程。',
  },
  {
    matches: (name) => name.startsWith('cordis_'),
    reason: '流程里的 agent 节点不能看宿主内部。',
  },
  {
    matches: (name) => name.startsWith('workbench_diy_') || name.startsWith('workbench_panels_'),
    reason: '流程里的 agent 节点不能动工作台本身。',
  },
  {
    matches: (name) => name === 'workbench_long_tasks_stop',
    reason: '流程里的 agent 节点不能停别的长任务。',
  },
];

export const FLOW_CHILD_HIDDEN_TOOLS: readonly string[] = [
  'ask_user_question',
  'subagent',
  'subagent_fork',
  'send_message',
  'workflow',
  'present',
  'create_goal',
  'update_goal',
  'exit_plan_mode',
];

export function flowChildDenial(name: string): string | undefined {
  for (const denial of CHILD_DENIALS) {
    if (denial.matches(name)) return denial.reason;
  }
  return undefined;
}

export interface FlowAgentGateway {
  readonly port: FlowAgentPort | undefined;
  readonly isChild: (sessionId: string) => boolean;
}

export function createFlowAgentGateway(ctx: DshHostContext): FlowAgentGateway {
  const children = new Set<string>();
  const isChild = (sessionId: string): boolean => children.has(sessionId);
  const subagents = ctx.get('subagents') as unknown as DshSubagentRuntime | undefined;
  const agents = ctx.get('agents') as unknown as DshAgentRegistry | undefined;
  if (subagents === undefined || agents === undefined) return { port: undefined, isChild };

  return {
    isChild,
    port: {
      async open(context) {
        if (context.sessionId !== undefined) {
          const parent = agents.get(context.sessionId as DshSessionId);
          if (parent === undefined) {
            throw new Error('起这一趟的会话已经关了，agent 节点跑不了');
          }
          return runnerOf({ subagents, parent, children });
        }
        let handle: DshAgentHandle;
        try {
          handle = await agents.create({
            sessionId: randomUUID() as DshSessionId,
            meta: { cwd: context.workspace, origin: OWNER_ORIGIN, agentPreset: ownerPresetOf(ctx) },
          });
        } catch (error) {
          throw new Error(`这一趟没有会话，agent 节点要自建一个：${messageOf(error)}`, {
            cause: error,
          });
        }
        const runner = runnerOf({ subagents, parent: handle.agent, children });
        return {
          run: runner.run,
          dispose: async () => {
            await runner.dispose();
            await handle.dispose();
          },
        };
      },
    },
  };
}

function ownerPresetOf(ctx: DshHostContext): string {
  const presets = ctx.get('agentPresets') as unknown as
    | { list(): readonly { readonly id: string; readonly broken?: string }[] }
    | undefined;
  const usable = (presets?.list() ?? [])
    .filter((row) => row.broken === undefined)
    .map((row) => row.id);
  if (usable.includes(OWNER_PRESET)) return OWNER_PRESET;
  const first = usable[0];
  if (first === undefined) {
    throw new Error('这一份 dsh 没有可用的 agent 模式，流程里的 agent 节点跑不了');
  }
  return first;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runnerOf(parts: {
  readonly subagents: DshSubagentRuntime;
  readonly parent: DshAgent;
  readonly children: Set<string>;
}): FlowAgentRunner {
  return {
    async run(request, signal) {
      if (parts.subagents.getProvider(SUBAGENT_PROVIDER) === undefined) {
        throw new Error(`这一份 dsh 没装 ${SUBAGENT_PROVIDER} 子代理后端，agent 节点跑不了`);
      }
      const childId = randomUUID() as DshSessionId;
      parts.children.add(childId);
      let activation;
      try {
        activation = await parts.subagents.startActivation({
          provider: SUBAGENT_PROVIDER,
          childId,
          label: request.label ?? request.stepId,
          ...(request.name === undefined ? {} : { name: request.name }),
          prompt: [{ type: 'text', text: request.prompt }] as DshContentBlock[],
          parent: parts.parent,
          signal,
          delivery: 'caller',
          ...(request.preset === undefined ? {} : { agentPreset: request.preset }),
          ...(request.provider === undefined && request.model === undefined
            ? {}
            : {
                agentOptions: {
                  ...(request.provider === undefined ? {} : { provider: request.provider }),
                  ...(request.model === undefined ? {} : { model: request.model }),
                },
              }),
          ...(request.schema === undefined
            ? {}
            : { outputSchema: request.schema as unknown as DshObjectJsonSchema }),
          ...(request.cwd === undefined ? {} : { cwd: request.cwd }),
        });
      } catch (error) {
        parts.children.delete(childId);
        throw error;
      }
      try {
        return resultOf(await activation.result, activation.childId, activation.name);
      } finally {
        parts.children.delete(activation.childId);
        await activation.dispose();
      }
    },
    dispose: async () => {},
  };
}

function resultOf(
  result: { readonly output: readonly DshContentBlock[]; readonly structured?: unknown; readonly stopReason: string },
  childId: string,
  name: string,
): FlowAgentResult {
  return {
    text: textOf(result.output),
    ...(result.structured === undefined ? {} : { value: result.structured }),
    childId,
    name,
    stopReason: result.stopReason,
  };
}

function textOf(blocks: readonly DshContentBlock[]): string {
  return blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
