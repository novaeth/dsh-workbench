import type { ApprovalCall, ApprovalVerdict } from '@dsh-workbench/shared/host';
import { DIY_PLAN_TOOL } from '../unit';
import { argsOf, askOf, pair } from './approval';

function planBodyOf(raw: Readonly<Record<string, unknown>>): boolean {
  const see = raw['see'];
  const shots = raw['shots'];
  return (Array.isArray(see) && see.length > 0) || (Array.isArray(shots) && shots.length > 0);
}

export interface PlanFlowStep {
  readonly id: string;
  readonly title?: string | undefined;
}

export type PlanFlowStepOf = (session: string) => PlanFlowStep | null;

function planAskVerdict(summary: string): ApprovalVerdict {
  const chars = [...summary];
  const short = chars.length > 15 ? `${chars.slice(0, 15).join('')}…` : summary;
  const title = pair(`${short}的方案`, `Plan: ${short}`);
  return askOf('diy plan: build a board card once the user approves the plan', title, title);
}

export function confirmVerdictFor(
  call: ApprovalCall,
  flowStepOf?: PlanFlowStepOf,
): ApprovalVerdict | undefined {
  if (call.name !== DIY_PLAN_TOOL) return undefined;
  const raw = argsOf(call);
  const destination = raw['destination'];
  if (destination !== 'board' && destination !== 'headless' && destination !== 'tweak') return { kind: 'allow' };
  const summaryValue = raw['summary'];
  const summary = typeof summaryValue === 'string' ? summaryValue.trim() : '';
  if (summary === '' || !planBodyOf(raw)) return { kind: 'allow' };
  const step = call.session === undefined || flowStepOf === undefined ? undefined : flowStepOf(call.session);
  if (step === undefined) return planAskVerdict(summary);
  if (step === null) {
    return destination === 'tweak'
      ? planAskVerdict(summary)
      : {
          kind: 'deny',
          reason:
            '现在还没到「确认方案」：先只提交去向与一句话复述；查看数据来源提交完后，在「确认方案」那一步再提交四段与界面预览。',
        };
  }
  if (step.id !== 'plan') {
    return {
      kind: 'deny',
      reason: `现在停在「${step.title ?? step.id}」；这一步用 workbench_diy_step 提交，方案四段与界面预览只在方案那一步提交。`,
    };
  }
  return planAskVerdict(summary);
}
