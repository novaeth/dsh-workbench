import { Fragment, createElement as h } from 'react';
import type { ApprovalInput, ReactNode, Translate } from '@dsh-workbench/shared';
import { ApprovalPlan } from '@dsh-workbench/shared';
import { ALL_TOOLS, DIY_RECORD_PREPARE_TOOL, LONG_TASKS_STOP_TOOL } from '@/modules/panels/client';

export interface ApprovalRow {
  readonly label: string;
  readonly value: string;
}

function textOf(args: Readonly<Record<string, unknown>>, key: string): string {
  const value = args[key];
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

export function recordApprovalRows(
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly ApprovalRow[] {
  const unit = textOf(args, 'unit');
  const doing = textOf(args, 'doing');
  const url = textOf(args, 'url');
  return [
    { label: t('approval.record.site'), value: url === '' ? t('approval.record.noUrl') : url },
    {
      label: t('approval.record.what'),
      value: doing === '' ? t('approval.record.oneAction') : `「${doing}」`,
    },
    { label: t('approval.record.lands'), value: `shots/rec-${unit === '' ? '<unit>' : unit}.jsonl` },
  ];
}

export interface ApprovalPlanView {
  readonly rows: readonly ApprovalRow[];
  readonly warn?: string | undefined;
}

export function shellClaimsApprovalDetail(tool: string): boolean {
  return (ALL_TOOLS as readonly string[]).includes(tool);
}

function stopApprovalRows(
  args: Readonly<Record<string, unknown>>,
  t: Translate,
): readonly ApprovalRow[] {
  const unit = textOf(args, 'unit');
  const id = textOf(args, 'id');
  return [
    {
      label: t('approval.longTask.what'),
      value: `${unit === '' ? '<unit>' : unit} · ${id === '' ? '<id>' : id}`,
    },
  ];
}

export function shellApprovalPlan(input: ApprovalInput, t: Translate): ApprovalPlanView | undefined {
  if (input.tool === DIY_RECORD_PREPARE_TOOL) {
    return { rows: recordApprovalRows(input.args, t), warn: t('approval.record.noSwitch') };
  }
  if (input.tool === LONG_TASKS_STOP_TOOL) {
    return {
      rows: stopApprovalRows(input.args, t),
      warn: t('approval.longTask.signal'),
    };
  }
  return shellClaimsApprovalDetail(input.tool) ? { rows: [] } : undefined;
}

export function shellApprovalDetail(input: ApprovalInput, t: Translate): ReactNode {
  const plan = shellApprovalPlan(input, t);
  if (plan === undefined) return undefined;
  if (plan.rows.length === 0) return h(Fragment, null);
  return <ApprovalPlan rows={plan.rows} warn={plan.warn} />;
}
