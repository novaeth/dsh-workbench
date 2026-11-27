import type {
  DshHostContext,
  DshToolDefinition,
  DshToolRunContext,
  ReadmeShot,
} from '@dsh-workbench/shared/host';
import { README_SECTION_KEYS, readmeShotKindProblem, sessionIdOf } from '@dsh-workbench/shared/host';
import { DIY_PLAN_TOOL } from '../../unit';
import { plainJson } from '../diy-context';
import { toolRegistryOf } from '../tool-registry-guard';
import { HEADLESS_LABELS, PLAN_DRAFT_PROPERTIES, SECTION_LABELS } from './definitions';
import { planBaselineOf, planStep, type Destination, type PlanApproval } from './plan-step';
import { PROGRESS_OUTPUT } from './progress-output';
import { packNoteOf } from './pack-note';
import type { DiyFlowRuns } from './runs';

const DESTINATIONS: readonly Destination[] = ['board', 'headless', 'tweak'];
const DEAD_FIELDS = ['cells', 'steps', 'minutes'] as const;

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasPlanContent(record: Readonly<Record<string, unknown>>): boolean {
  return ['shots', 'see', 'do', 'agent', 'data'].some((key) => Array.isArray(record[key])) || record['approval'] !== undefined;
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

function validatedSections(
  record: Record<string, unknown>,
  destination: Destination,
): Record<string, string[]> {
  const labels = destination === 'headless' ? HEADLESS_LABELS : SECTION_LABELS;
  const out: Record<string, string[]> = {};
  for (const key of README_SECTION_KEYS) {
    const raw = record[key];
    const label = labels[key];
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

function validatedChanges(sections: Record<string, string[]>): void {
  let changed = 0;
  for (const key of README_SECTION_KEYS) {
    const items = sections[key] ?? [];
    if (items.length === 1 && items[0] === UNCHANGED) continue;
    if (items.includes(UNCHANGED)) {
      throw new Error(`invalid plan: ${key} 这一段没变就只写「${UNCHANGED}」一条，不要和其它条目混在一起`);
    }
    for (const item of items) {
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
}

function validatedApproval(value: unknown): PlanApproval | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid plan: 写工具需要审批四格：修改项、修改后、目标位置、影响范围');
  }
  const record = value as Record<string, unknown>;
  const fields = ['object', 'change', 'target', 'impact'] as const;
  const missing = fields.filter((key) => asText(record[key]) === '');
  if (missing.length > 0) {
    throw new Error(`invalid plan: 审批四格缺少 ${missing.join(' / ')}；补齐修改项、修改后、目标位置、影响范围`);
  }
  return {
    object: asText(record['object']),
    change: asText(record['change']),
    target: asText(record['target']),
    impact: asText(record['impact']),
  };
}

function validatedPresentation(
  destination: Destination,
  sections: Record<string, string[]>,
  shots: readonly ReadmeShot[],
  approval: PlanApproval | undefined,
): void {
  const hasVisual = shots.some((shot) => shot.kind !== 'approval');
  if (!hasVisual && destination === 'board') throw new Error('invalid plan: 给一张卡片图，图里用真实文案');
  if (!hasVisual && destination === 'tweak') throw new Error('invalid plan: 给一张改之后的图，图里用真实文案');
  const approvalShots = shots.filter((shot) => shot.kind === 'approval');
  const mentionsApproval = Object.values(sections).some((items) => items.some((item) => item.includes('审批')));
  if (!mentionsApproval && (approval !== undefined || approvalShots.length > 0)) {
    throw new Error('invalid plan: 四段没写需要审批的写工具；删掉审批图与审批四格，或在 agent 段写清写操作');
  }
  if (!mentionsApproval) return;
  if (approval === undefined) {
    throw new Error('invalid plan: 有写工具时要补齐审批四格：修改项、修改后、目标位置、影响范围');
  }
  if (approvalShots.length === 0) {
    throw new Error('invalid plan: 有写工具时要给一张 kind: "approval" 的审批屏');
  }
  if (approvalShots.some((shot) => !/审批|approval/iu.test(shot.caption))) {
    throw new Error('invalid plan: 审批图的图注要写清「审批屏」，不要与卡片图混用');
  }
}

function checkFlowInput(
  runs: DiyFlowRuns,
  session: string,
  destination: Destination,
  summary: string,
  restart: boolean,
): void {
  if (runs.stepOf(session) === null) return;
  const input = runs.inputOf(session);
  if (input['destination'] !== destination) {
    throw new Error('当前流程的去向已锁定；先调用 workbench_diy_step（cancel: true）终止当前流程，再用新去向重开。');
  }
  if (input['summary'] !== summary && !restart) {
    throw new Error('需求复述变了；确认这次会从头来后，带 restart: true 重新调用。当前进度保持不变。');
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
      '创建或修改模块时使用。先提交去向与复述，再在方案步提交四段；之后每一步用 workbench_diy_step。' +
      '看板与改模块至少一张非审批图；有写工具时补 approval 四格和 kind: "approval" 的审批屏。' +
      '无看板四段写输出 / 触发 / 批准 / 数据。改模块每条以「新增：」「删除：」「修改：」开头，没变的段只写「没变」。' +
      '去向不可更改；summary 变化会先拒绝，确认进度从头开始后用 restart: true 重开。',
    parameters: {
      type: 'object',
      properties: {
        destination: {
          type: 'string',
          enum: [...DESTINATIONS],
        },
        summary: {
          type: 'string',
          description: '一句话复述用户要什么，尽量用用户的原话；改模块时写这次改了什么。',
        },
        restart: {
          type: 'boolean',
          description: '需求复述变化时显式重开；旧进度会全部清除。',
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
      for (const key of DEAD_FIELDS) {
        if (record[key] !== undefined) throw new Error(`invalid plan: ${key} 没有消费者；删掉这个字段，需要表达时写进方案正文或图注`);
      }
      const destination = asText(record['destination']) as Destination;
      if (!DESTINATIONS.includes(destination)) {
        throw new Error(`去向只能是：${DESTINATIONS.join(' / ')}`);
      }
      const summary = asText(record['summary']);
      if (summary === '') throw new Error('summary 不能为空：用用户的原话复述一遍');
      const restart = record['restart'] === true;
      checkFlowInput(runs, session, destination, summary, restart);
      const current = runs.stepOf(session);
      const willStartAtPlan = current === null && destination === 'tweak';
      const hasContent = hasPlanContent(record);
      const submittingPlan = current?.id === 'plan' || (willStartAtPlan && hasContent);
      const sections = submittingPlan ? validatedSections(record, destination) : {};
      const shots = asShots(record['shots']);
      const approval = validatedApproval(record['approval']);
      if (!submittingPlan && hasContent) {
        throw new Error(
          current === null
            ? '现在还没到「确认方案」：先只提交去向与一句话复述；查看数据来源提交完后，在「确认方案」那一步再提交四段与界面预览。'
            : `现在停在「${current.title ?? current.id}」；这一步用 workbench_diy_step 提交，方案四段与界面预览只在方案那一步提交。`,
        );
      }
      if (submittingPlan && destination === 'tweak') validatedChanges(sections);
      if (submittingPlan) validatedPresentation(destination, sections, shots, approval);

      const result = await planStep(runs, session, {
        destination,
        summary,
        restart,
        ...(shots.length === 0 ? {} : { shots }),
        ...(approval === undefined ? {} : { approval }),
        ...(sections['see'] === undefined ? {} : { see: sections['see'] }),
        ...(sections['do'] === undefined ? {} : { do: sections['do'] }),
        ...(sections['agent'] === undefined ? {} : { agent: sections['agent'] }),
        ...(sections['data'] === undefined ? {} : { data: sections['data'] }),
      });

      if (!result.ok) throw new Error(result.text);
      const packNote = packNoteOf(ctx, exec, result.step);
      const currentSummary = asText(runs.inputOf(session)['summary']);
      const baseline = planBaselineOf(runs.valuesOf(session), currentSummary);
      return plainJson({
        ...result,
        baseline: baseline ?? { available: false },
        text: `${result.text}${packNote === '' ? '' : ` ${packNote}`}`,
        step: result.step ?? '',
      });
    },
  };
}
