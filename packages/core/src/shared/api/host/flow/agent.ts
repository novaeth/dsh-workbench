import { randomUUID } from 'node:crypto';
import type { WorkbenchModelChoice } from '@/kernel/contract/workbench-settings';
import { createDshAi } from '../ai-adapter';
import { moduleModelOf } from '../module-model';
import { contentBlocksOf, type AttachmentStore } from '../ai-blocks';
import { imagePartOf } from '@dsh-workbench/shared/host';
import type {
  DshAgent,
  DshAgentHandle,
  DshAgentOptions,
  DshAgentRegistry,
  DshContentBlock,
  DshHostContext,
  DshObjectJsonSchema,
  DshSessionId,
  DshSubagentRuntime,
  AiPort,
  FlowAgentPort,
  FlowAgentRequest,
  FlowAgentResult,
  FlowAgentRunner,
} from '@dsh-workbench/shared/host';

const SUBAGENT_PROVIDER = 'spawn';
const OWNER_PRESET = 'standard';

interface ChildDenial {
  readonly matches: (name: string) => boolean;
  readonly reason: string;
}

const ASK_USER = 'ask_user_question';
const DELEGATE = new Set([
  'subagent',
  'subagent_fork',
  'send_message',
  'list_agents',
  'wait_agent',
  'list_subagent_models',
]);
const WORKFLOW = 'workflow';
const EXIT_PLAN = 'exit_plan_mode';
const PRESENT = 'present';
const GOALS = new Set(['create_goal', 'update_goal']);
const TOOLBOX = ['workbench_toolbox_list', 'workbench_toolbox_open', 'workbench_toolbox_close'] as const;
const READ_ONLY = ['skill', 'bash', 'write', 'edit'] as const;

const CHILD_DENIALS: readonly ChildDenial[] = [
  {
    matches: (name) => name === ASK_USER,
    reason: '流程里的 agent 节点不能问人：要人处理请写在动作步骤的 ctx.need 里。',
  },
  {
    matches: (name) => DELEGATE.has(name),
    reason: '流程里的 agent 节点不再委派：编排归流程，下一步写成动作步骤或另一个 agent 节点。',
  },
  {
    matches: (name) => name === WORKFLOW,
    reason: '流程里的 agent 节点不能自己跑 workflow：编排归流程。',
  },
  {
    matches: (name) => name === EXIT_PLAN,
    reason: '流程里的 agent 节点没有计划审批出口。',
  },
  {
    matches: (name) => name === PRESENT,
    reason: '流程里的 agent 节点不能交交付件：结论写回步骤，落盘由动作步骤做。',
  },
  {
    matches: (name) => GOALS.has(name),
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
    matches: (name) => name.startsWith('workbench_toolbox_'),
    reason: '流程里的 agent 节点不能自己开工具包：工具面由这一步的 preset 定。',
  },
  {
    matches: (name) => name === 'workbench_long_tasks_stop',
    reason: '流程里的 agent 节点不能停别的长任务。',
  },
  {
    matches: (name) => name === 'skill' || name === 'bash' || name === 'write' || name === 'edit',
    reason: '流程里的 agent 节点只读：不加载技能、不执行 shell 命令、不写入或修改文件。',
  },
];

export const FLOW_CHILD_HIDDEN_TOOLS: readonly string[] = [
  ASK_USER,
  ...DELEGATE,
  WORKFLOW,
  EXIT_PLAN,
  PRESENT,
  ...GOALS,
  ...TOOLBOX,
  ...READ_ONLY,
];

export function flowChildDenial(name: string): string | undefined {
  for (const denial of CHILD_DENIALS) {
    if (denial.matches(name)) return denial.reason;
  }
  return undefined;
}

export function flowChildHiddenNames(names: Iterable<string>): readonly string[] {
  return [...names].filter((name) => flowChildDenial(name) !== undefined);
}

export interface FlowAgentGateway {
  readonly port: FlowAgentPort | undefined;
  readonly isChild: (sessionId: string) => boolean;
  readonly ai: AiPort;
}

export function createFlowAgentGateway(ctx: DshHostContext): FlowAgentGateway {
  const children = new Set<string>();
  const isChild = (sessionId: string): boolean => children.has(sessionId);
  const subagents = ctx.get('subagents') as unknown as DshSubagentRuntime | undefined;
  const store = ctx.get('attachments') as unknown as AttachmentStore | undefined;
  const agents = ctx.get('agents') as unknown as DshAgentRegistry | undefined;
  if (subagents === undefined || agents === undefined) return { port: undefined, isChild, ai: createDshAi(ctx, () => undefined) };

  const port: FlowAgentPort = {
    async open(context) {
        const moduleModel = moduleModelOf(ctx);
        if (context.sessionId !== undefined) {
          const parent = agents.get(context.sessionId as DshSessionId);
          if (parent === undefined) {
            throw new Error('起这一趟的会话已经关了，agent 节点跑不了');
          }
          return runnerOf({ subagents, parent, children, attachments: store, moduleModel });
        }
        const agentPreset = await ownerPresetOf(ctx);
        const agentOptions = ownerModelOf(ctx);
        let handle: DshAgentHandle;
        try {
          handle = await agents.create({
            sessionId: randomUUID() as DshSessionId,
            meta: { cwd: context.workspace, agentPreset },
            agentOptions,
          });
        } catch (error) {
          throw new Error(`这一趟没有会话，agent 节点要自建一个：${messageOf(error)}`, {
            cause: error,
          });
        }
        const runner = runnerOf({
          subagents,
          parent: handle.agent,
          children,
          attachments: store,
          moduleModel,
        });
        return {
          run: runner.run,
          dispose: async () => {
            await runner.dispose();
            await handle.dispose();
          },
        };
    },
  };
  const ai = createDshAi(ctx, () => port);
  return { isChild, ai, port };
}

async function ownerPresetOf(ctx: DshHostContext): Promise<string> {
  const presets = ctx.get('agentPresets') as unknown as
    | { list(): Promise<readonly { readonly id: string; readonly broken?: string }[]> }
    | undefined;
  const usable = (presets === undefined ? [] : await presets.list())
    .filter((row) => row.broken === undefined)
    .map((row) => row.id);
  if (usable.includes(OWNER_PRESET)) return OWNER_PRESET;
  const first = usable[0];
  if (first === undefined) {
    throw new Error('这一份 dsh 没有可用的 agent 模式，流程里的 agent 节点跑不了');
  }
  return first;
}

function ownerModelOf(ctx: DshHostContext): DshAgentOptions {
  const moduleModel = moduleModelOf(ctx);
  if (moduleModel !== undefined) return { provider: moduleModel.provider, model: moduleModel.model };
  const defaults = ctx.get('agentDefaultModel') as unknown as
    | { currentSelection(): DshAgentOptions }
    | undefined;
  if (defaults === undefined) {
    throw new Error('这一份 dsh 没有默认模型，流程里的 agent 节点跑不了 —— 先在设置里选一个模型');
  }
  return defaults.currentSelection();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function promptBlocksOf(
  request: FlowAgentRequest,
  store: AttachmentStore | undefined,
): Promise<DshContentBlock[]> {
  const images = await Promise.all((request.images ?? []).map((one) => imagePartOf(one)));
  const blocks = await contentBlocksOf(
    [{ kind: 'text', text: request.prompt }, ...images],
    store,
    '这一份运行时没有附件服务，agent 节点带不了图片',
  );
  return blocks as unknown as DshContentBlock[];
}

function runnerOf(parts: {
  readonly subagents: DshSubagentRuntime;
  readonly parent: DshAgent;
  readonly children: Set<string>;
  readonly attachments?: AttachmentStore | undefined;
  readonly moduleModel?: WorkbenchModelChoice | undefined;
}): FlowAgentRunner {
  return {
    async run(request, signal) {
      if (parts.subagents.getProvider(SUBAGENT_PROVIDER) === undefined) {
        throw new Error(`这一份 dsh 没装 ${SUBAGENT_PROVIDER} 子代理后端，agent 节点跑不了`);
      }
      const childId = randomUUID() as DshSessionId;
      parts.children.add(childId);
      const stepModel = stepModelOf(request, parts.moduleModel);
      let activation;
      try {
        activation = await parts.subagents.startActivation({
          provider: SUBAGENT_PROVIDER,
          childId,
          label: request.label ?? request.stepId,
          ...(request.name === undefined ? {} : { name: request.name }),
          prompt: await promptBlocksOf(request, parts.attachments),
          parent: parts.parent,
          signal,
          delivery: 'caller',
          ...(request.preset === undefined ? {} : { agentPreset: request.preset }),
          ...(stepModel === undefined ? {} : { agentOptions: stepModel }),
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

function stepModelOf(
  request: FlowAgentRequest,
  moduleModel: WorkbenchModelChoice | undefined,
): { readonly provider?: string; readonly model?: string } | undefined {
  if (request.provider === undefined && request.model === undefined) {
    return moduleModel === undefined
      ? undefined
      : { provider: moduleModel.provider, model: moduleModel.model };
  }
  return {
    ...(request.provider === undefined ? {} : { provider: request.provider }),
    ...(request.model === undefined ? {} : { model: request.model }),
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
