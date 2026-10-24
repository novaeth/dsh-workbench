import { describe, expect, it } from 'vitest';
import { APPROVAL_HEADLINE_LIMIT } from '@dsh-workbench/shared/host';
import { panelsApproval, panelsApprovalFor } from '../model/approval';
import { stopRuns } from './approval-samples';
import { LONG_TASKS_STOP_TOOL } from '../unit';

describe('停长任务那一档（ADR-0070）：自己的免问、别人的/用户的要问、不认识的没意见', () => {
  const stop = { name: LONG_TASKS_STOP_TOOL, arguments: { unit: 'inventory', id: 'run-1' } } as const;

  it('★ 自己起的：allow（不问）', () => {
    const policy = panelsApprovalFor(stopRuns({ session: 's1' }));

    expect(policy({ ...stop, session: 's1' })).toEqual({ kind: 'allow' });
  });

  it('★ 别人的会话起的：ask，说清是别的会话 + 那一趟的名字', () => {
    const verdict = panelsApprovalFor(stopRuns({ session: 's9' }))({ ...stop, session: 's1' });

    expect(verdict?.kind).toBe('ask');
    expect(verdict?.kind === 'ask' ? verdict.reason : '').toContain(LONG_TASKS_STOP_TOOL);
    expect(verdict?.kind === 'ask' ? verdict.fallback.zh : '').toBe(
      'agent 想停掉工作台 [inventory] 那一趟「env-prod」长任务，别的会话起的，允许吗？',
    );
  });

  it('★ 用户自己按的那一趟（没有来源）：ask，兜底句与问句都点名"用户自己按的"', () => {
    const verdict = panelsApprovalFor(stopRuns())({ ...stop, session: 's1' });

    expect(verdict?.kind).toBe('ask');
    if (verdict?.kind !== 'ask') return;
    expect(verdict.fallback.zh).toBe(
      'agent 想停掉工作台 [inventory] 那一趟「env-prod」长任务，用户自己按的，允许吗？',
    );
    expect(verdict.fallback.en).toBe(
      'The agent wants to stop a long-running workbench job [inventory] "env-prod" the user started. Allow?',
    );
    expect(verdict.question.zh).toContain('会停掉');
  });

  it('★ 不认识的 id / 不认识的单元 / 没给 id：allow（无可停 = 无可写；处理函数会回那句"没有这一趟"）', () => {
    const policy = panelsApprovalFor(stopRuns());

    expect(policy({ name: LONG_TASKS_STOP_TOOL, arguments: { unit: 'inventory', id: 'run-9' } })).toEqual({ kind: 'allow' });
    expect(policy({ name: LONG_TASKS_STOP_TOOL, arguments: { unit: 'demo', id: 'run-1' } })).toEqual({ kind: 'allow' });
    expect(policy({ name: LONG_TASKS_STOP_TOOL, arguments: { unit: 'inventory' } })).toEqual({ kind: 'allow' });
    expect(policy({ name: LONG_TASKS_STOP_TOOL, arguments: {} })).toEqual({ kind: 'allow' });
  });

  it('★ 没交注册表（老外壳 / 老套件）时按"别人的"问：保守的那一侧，不静默放行', () => {
    expect(panelsApproval(stop)).toEqual(panelsApprovalFor(undefined)(stop));
    expect(panelsApproval(stop)?.kind).toBe('ask');
  });

  it('★ 目标名再长也不许把上屏那句顶爆：截到 20 字加省略号，整句仍在装配上限内', () => {
    const verdict = panelsApprovalFor(stopRuns({ target: 'x'.repeat(40) }))({ ...stop, session: 's1' });

    expect(verdict?.kind).toBe('ask');
    if (verdict?.kind !== 'ask') return;
    expect(verdict.fallback.zh).toContain(`「${'x'.repeat(20)}…」`);
    expect(verdict.fallback.zh).not.toContain('x'.repeat(21));
    expect(verdict.fallback.zh.length).toBeLessThanOrEqual(APPROVAL_HEADLINE_LIMIT);
    expect(verdict.fallback.en).toContain(`"${'x'.repeat(20)}…"`);
  });
});
