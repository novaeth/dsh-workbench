import type { FlowNodeStep, ReadmeDraft, ReadmeShot } from '@dsh-workbench/shared/host';
import { README_SECTION_KEYS } from '@dsh-workbench/shared/host';
import { positionOf, titleOf } from './position';
import type { DiyFlowRuns } from './runs';

export type Destination = 'board' | 'headless' | 'tweak';

export interface PlanApproval {
  readonly object: string;
  readonly change: string;
  readonly target: string;
  readonly impact: string;
}

export interface PlanInput extends ReadmeDraft {
  readonly destination: Destination;
  readonly restart?: boolean | undefined;
  readonly approval?: PlanApproval | undefined;
}

export interface PlanBaseline {
  readonly available: true;
  readonly summary: string;
  readonly shots: readonly ReadmeShot[];
  readonly see: readonly string[];
  readonly do: readonly string[];
  readonly agent: readonly string[];
  readonly data: readonly string[];
  readonly approval?: PlanApproval | undefined;
}

const NEXT: Readonly<Record<string, string>> = {
  probe: '站探完成后提交读取到的站点',
  plan: '补上方案四段与界面预览',
  build: '开始编写模块；写完后提交这一步的结果',
  install: '安装并显示到面板；装完后提交这一步的结果',
  verify: '执行一遍检查；检查完后提交这一步的结果',
  ledger: '保存设计记录；保存后提交这一步的结果',
};

function nextOf(step: string, destination: Destination): string {
  if (step === 'plan') {
    if (destination === 'headless') return '补上输出 / 触发 / 批准 / 数据四段（用 workbench_diy_plan）';
    return destination === 'tweak'
      ? '补上四段变化与改之后的界面预览（用 workbench_diy_plan）'
      : '补上方案四段与界面预览（用 workbench_diy_plan）';
  }
  return `${NEXT[step] ?? step}（workbench_diy_step）`;
}

export interface PlanResult {
  readonly ok: boolean;
  readonly step: string | null;
  readonly index: number;
  readonly total: number;
  readonly remaining: number;
  readonly done: boolean;
  readonly restarted?: boolean | undefined;
  readonly text: string;
}

export async function planStep(
  runs: DiyFlowRuns,
  session: string,
  input: PlanInput,
): Promise<PlanResult> {
  const running = runs.stepOf(session);
  const at = running?.id ?? null;
  let restarted = false;

  if (running !== null) {
    const currentDestination = runs.inputOf(session)['destination'];
    if (currentDestination !== input.destination) {
      return refused(
        input,
        '当前流程的去向已锁定；先调用 workbench_diy_step（cancel: true）终止当前流程，再用新去向重开。',
      );
    }
    if (runs.inputOf(session)['summary'] !== input.summary && input.restart !== true) {
      return refused(
        input,
        '需求复述变了；确认这次会从头来后，带 restart: true 重新调用。当前进度保持不变。',
      );
    }
    if (input.restart === true) {
      runs.stop(session);
      restarted = true;
    } else if (at === 'plan') {
      const planned = await runs.advance(session, planValue(input));
      if (!planned.ok) return refused(input, planned.problem ?? '方案未提交');
      return advanced(planned.step, input.destination);
    } else if (at !== null) {
      const position = positionOf(at, input.destination, runs.valuesOf(session));
      return refused(
        input,
        `当前停在第 ${position.index}/${position.total} 步（${running.title ?? at}）；这一步用 workbench_diy_step 提交`,
      );
    }
  }

  runs.start(session, { destination: input.destination, summary: input.summary });
  const first = runs.stepOf(session);
  const result =
    first?.id === 'plan' && hasPlanValue(input)
      ? await submitNewPlan(runs, session, input)
      : advanced(first, input.destination);
  return restarted ? { ...result, restarted: true, text: `这次会从头来，进度已重置。${result.text}` } : result;
}

async function submitNewPlan(runs: DiyFlowRuns, session: string, input: PlanInput): Promise<PlanResult> {
  const planned = await runs.advance(session, planValue(input));
  if (!planned.ok) return refused(input, planned.problem ?? '方案未提交');
  return advanced(planned.step, input.destination);
}

function hasPlanValue(input: PlanInput): boolean {
  return (
    input.shots !== undefined ||
    input.see !== undefined ||
    input.do !== undefined ||
    input.agent !== undefined ||
    input.data !== undefined ||
    input.approval !== undefined
  );
}

function planValue(input: PlanInput): Record<string, unknown> {
  const value: Record<string, unknown> = { baseline: true };
  if (input.shots !== undefined) value['shots'] = input.shots;
  if (input.see !== undefined) value['see'] = input.see;
  if (input.do !== undefined) value['do'] = input.do;
  if (input.agent !== undefined) value['agent'] = input.agent;
  if (input.data !== undefined) value['data'] = input.data;
  if (input.approval !== undefined) value['approval'] = input.approval;
  return value;
}

function baselineItems(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (value.some((one) => typeof one !== 'string' || one.trim() === '')) return null;
  return value.map((one) => one.trim());
}

function baselineShots(value: unknown): ReadmeShot[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (
    value.some(
      (one) =>
        typeof one !== 'object' ||
        one === null ||
        typeof (one as { caption?: unknown }).caption !== 'string' ||
        typeof (one as { ascii?: unknown }).ascii !== 'string',
    )
  ) {
    return null;
  }
  return value as ReadmeShot[];
}

function baselineApproval(value: unknown): PlanApproval | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (['object', 'change', 'target', 'impact'].some((key) => typeof record[key] !== 'string' || record[key] === '')) {
    return null;
  }
  return value as PlanApproval;
}

export function planBaselineOf(
  values: Readonly<Record<string, unknown>>,
  summary: string,
): PlanBaseline | undefined {
  const plan = values['plan'];
  if (typeof plan !== 'object' || plan === null || (plan as Record<string, unknown>)['baseline'] !== true) {
    return undefined;
  }
  const record = plan as Record<string, unknown>;
  const sections: Record<string, string[]> = {};
  for (const key of README_SECTION_KEYS) {
    const items = baselineItems(record[key]);
    if (items === null) return undefined;
    sections[key] = items;
  }
  const shots = baselineShots(record['shots']);
  const approval = baselineApproval(record['approval']);
  if (shots === null || approval === null) return undefined;
  return {
    available: true,
    summary,
    shots,
    see: sections['see'] ?? [],
    do: sections['do'] ?? [],
    agent: sections['agent'] ?? [],
    data: sections['data'] ?? [],
    ...(approval === undefined ? {} : { approval }),
  };
}

function refused(input: PlanInput, problem: string): PlanResult {
  const position = positionOf(null, input.destination);
  return {
    ok: false,
    step: null,
    index: 0,
    total: position.total,
    remaining: 0,
    done: false,
    text: problem,
  };
}

function advanced(step: FlowNodeStep | null, destination: Destination): PlanResult {
  if (step === null) {
    const position = positionOf(null, destination);
    return {
      ok: true,
      step: null,
      index: 0,
      total: position.total,
      remaining: 0,
      done: true,
      text: '流程已完成。',
    };
  }
  const position = positionOf(step.id, destination);
  return {
    ok: true,
    step: step.id,
    index: position.index,
    total: position.total,
    remaining: position.remaining,
    done: false,
    text: `停在第 ${position.index}/${position.total} 步（${titleOf(step.id, destination)}）。下一步：${nextOf(
      step.id,
      destination,
    )}。`,
  };
}
