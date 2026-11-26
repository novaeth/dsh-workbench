import type {
  DshHostContext,
  DshToolDefinition,
  DshToolRunContext,
  ReadmeSectionKey,
  ReadmeShot,
} from '@dsh-workbench/shared/host';
import { README_SECTION_KEYS, readmeShotKindProblem, sessionIdOf } from '@dsh-workbench/shared/host';
import { DIY_PLAN_TOOL } from '../../unit';
import { plainJson } from '../diy-context';
import { toolRegistryOf } from '../tool-registry-guard';
import { PLAN_DRAFT_PROPERTIES } from './definitions';
import { planStep, type Destination } from './plan-step';
import { PROGRESS_OUTPUT } from './progress-output';
import { packNoteOf } from './pack-note';
import type { DiyFlowRuns } from './runs';

const DESTINATIONS: readonly Destination[] = ['ready', 'once', 'reroute', 'board', 'headless', 'tweak'];
const BUILDABLE: readonly Destination[] = ['board', 'headless', 'tweak'];

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasPlanContent(record: Readonly<Record<string, unknown>>): boolean {
  return ['shots', 'see', 'do', 'agent', 'data'].some((key) => Array.isArray(record[key]));
}

function asShots(value: unknown): ReadmeShot[] {
  if (!Array.isArray(value)) return [];
  return value.map((one, at) => {
    const shot =
      typeof one === 'object' && one !== null
        ? (one as { kind?: unknown; caption?: unknown; ascii?: unknown })
        : {};
    const kind = shot.kind === undefined || shot.kind === '' ? undefined : shot.kind;
    const kindProblem = readmeShotKindProblem(kind);
    if (kindProblem !== undefined) throw new Error(`invalid plan: shots[${at}].${kindProblem}`);
    const caption = asText(shot.caption);
    const ascii = typeof shot.ascii === 'string' ? shot.ascii : '';
    if (caption === '') throw new Error(`invalid plan: shots[${at}].caption 不能为空（卡片 / 设置面 / 审批）`);
    if (ascii.trim() === '') throw new Error(`invalid plan: shots[${at}].ascii 不能为空，空图在审批卡片上不可见`);
    return {
      ...(kind === undefined ? {} : { kind: kind as ReadmeShot['kind'] }),
      caption,
      ascii,
    };
  });
}

const SECTION_LABELS: Readonly<Record<ReadmeSectionKey, string>> = {
  see: '一眼看到',
  do: '用户能做',
  agent: 'agent 能做什么',
  data: '数据从哪来',
};

function validatedSections(record: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of README_SECTION_KEYS) {
    const raw = record[key];
    const label = SECTION_LABELS[key];
    if (!Array.isArray(raw)) throw new Error(`invalid plan: 缺少 ${key}（${label}）`);
    const items = raw.map((one, at) => {
      if (typeof one !== 'string' || one.trim() === '') {
        throw new Error(`invalid plan: ${key}[${at}] 是空字符串；删除该项或写入一句`);
      }
      return one.trim();
    });
    if (items.length === 0) throw new Error(`invalid plan: ${key} 至少要写一条（${label}）`);
    out[key] = items;
  }
  return out;
}

const CHANGE_TAGS = ['新增', '删除', '修改'] as const;
const UNCHANGED = '没变';

function validatedChanges(sections: Record<string, string[]>, shots: readonly ReadmeShot[]): void {
  let changed = 0;
  let mentionsApproval = false;
  for (const key of README_SECTION_KEYS) {
    const items = sections[key] ?? [];
    if (items.length === 1 && items[0] === UNCHANGED) continue;
    if (items.includes(UNCHANGED)) {
      throw new Error(`invalid plan: ${key} 这一段没变就只写「${UNCHANGED}」一条，不要和其它条目混在一起`);
    }
    for (const item of items) {
      if (item.includes('审批')) mentionsApproval = true;
      const tag = CHANGE_TAGS.find((one) => item.startsWith(`${one}：`));
      if (tag === undefined) {
        throw new Error(
          `invalid plan: ${key} 的「${item}」要以「新增：」「删除：」「修改：」开头；这一段没变就写「${UNCHANGED}」`,
        );
      }
      if (item.slice(tag.length + 1).trim() === '') {
        throw new Error(`invalid plan: ${key} 的「${tag}：」后面没写改了什么`);
      }
      changed += 1;
    }
  }
  if (changed === 0) throw new Error(`invalid plan: 四段全是「${UNCHANGED}」，这次没有任何改动`);
  const hasApprovalShot = shots.some((shot) => shot.kind === 'approval');
  if (mentionsApproval && !hasApprovalShot) {
    throw new Error('invalid plan: 四段提到审批屏，但 shots 里没有 kind: "approval" 的图（给一张改之后的审批屏）');
  }
  if (hasApprovalShot && !mentionsApproval) {
    throw new Error('invalid plan: shots 里有 kind: "approval" 的图，但四段没写审批屏改了什么');
  }
}

export function registerDiyPlanTool(ctx: DshHostContext, runs: DiyFlowRuns): Array<() => void> {
  const tools = toolRegistryOf(ctx, '跳过 DIY 计划工具注册');
  if (tools === undefined) return [];
  return [tools.register(planToolOf(ctx, runs))];
}

function planToolOf(ctx: DshHostContext, runs: DiyFlowRuns): DshToolDefinition {
  return {
    name: DIY_PLAN_TOOL,
    description:
      '需要为用户创建或修改面板模块时，在动手之前使用：先说清用户要什么（先询问、等回答），再判断去向。' +
      '一次性任务、使用现成模块、只是提问都不要调用。' +
      '创建模块时第一次只提交去向与一句话复述，走到「确认方案」再提交四段（有看板时再加 ascii）；改模块从「补充方案」起步，可以一次提交完整方案。' +
      '流程开始后，除方案那一步外的每一步都用 workbench_diy_step 提交；返回 done: true 才算完成。' +
      '建模块（board / headless）时四段（see/do/agent/data）讲清这个模块是什么，再加一两张 shots；' +
      '改模块（tweak）时四段只写这次的变化：每条以「新增：」「删除：」「修改：」开头，没变的段只写一条「没变」' +
      '（不用解释它原本是什么），shots 只给改之后的图（不用画改前）；动了审批屏就四段都按审批屏写，' +
      '并给 kind: "approval" 的图。',
    parameters: {
      type: 'object',
      properties: {
        destination: {
          type: 'string',
          enum: [...DESTINATIONS],
          description:
            'ready=现成模块 / once=一次性 / reroute=改道 / board=看板模块 / headless=无看板模块（仍创建并安装） / tweak=修改已有模块',
        },
        summary: {
          type: 'string',
          description: '一句话复述用户要什么，尽量用用户的原话；改模块时写这次改了什么。',
        },
        ...PLAN_DRAFT_PROPERTIES,
      },
      required: ['destination', 'summary'],
      additionalProperties: false,
    },
    output: PROGRESS_OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const session = sessionIdOf(exec);
      if (session === null) throw new Error('当前会话没有 id，无法推进流程');
      const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      const destination = asText(record['destination']) as Destination;
      if (!DESTINATIONS.includes(destination)) {
        throw new Error(`去向只能是：${DESTINATIONS.join(' / ')}`);
      }
      const summary = asText(record['summary']);
      if (summary === '') throw new Error('summary 不能为空：用用户的原话复述一遍');
      const current = runs.stepOf(session);
      const willStartAtPlan = current === null && destination === 'tweak';
      const hasContent = hasPlanContent(record);
      const submittingPlan = current?.id === 'plan' || (willStartAtPlan && hasContent);
      const sections = submittingPlan ? validatedSections(record) : {};
      const shots = asShots(record['shots']);
      if (!submittingPlan && BUILDABLE.includes(destination) && hasContent) {
        throw new Error(
          current === null
            ? '现在还没到「确认方案」：先只提交去向与一句话复述；查看数据来源提交完后，在「确认方案」那一步再提交四段（有看板时再加 ascii）。'
            : `现在停在「${current.title ?? current.id}」；这一步用 workbench_diy_step 提交，方案四段（有看板时再加 ascii）只在方案那一步提交。`,
        );
      }
      if (submittingPlan && destination === 'tweak') validatedChanges(sections, shots);

      const result = await planStep(runs, session, {
        destination,
        summary,
        ...(asText(record['cells']) === '' ? {} : { cells: asText(record['cells']) }),
        ...(asText(record['steps']) === '' ? {} : { steps: asText(record['steps']) }),
        ...(asText(record['minutes']) === '' ? {} : { minutes: asText(record['minutes']) }),
        ...(shots.length === 0 ? {} : { shots }),
        ...(sections['see'] === undefined ? {} : { see: sections['see'] }),
        ...(sections['do'] === undefined ? {} : { do: sections['do'] }),
        ...(sections['agent'] === undefined ? {} : { agent: sections['agent'] }),
        ...(sections['data'] === undefined ? {} : { data: sections['data'] }),
      });

      if (!result.ok) throw new Error(result.text);
      const packNote = packNoteOf(ctx, exec, result.step);
      return plainJson({
        ...result,
        text: `${result.text}${packNote === '' ? '' : ` ${packNote}`}`,
        step: result.step ?? '',
      });
    },
  };
}
