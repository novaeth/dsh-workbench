import { describe, expect, it } from 'vitest';
import { approvalFor } from '@dsh-workbench/shared/host';
import { panelsApproval, panelsApprovalFor } from '../model/approval';
import { DIY_RECORD_PREPARE_TOOL } from '../unit';
import { heldStore } from './record-fixtures';

const call = (session?: string) => ({
  name: DIY_RECORD_PREPARE_TOOL,
  arguments: { unit: 'demo', url: 'https://inventory.example.com/env', doing: '发布' },
  ...(session === undefined ? {} : { session }),
});

describe('录制那一档：已经活着的一场录制，再 prepare 连问都不问（ADR-0064 §2.3 的判据）', () => {
  it('★★ 同一个会话已持有一场 ⇒ 直接拒（理由 = 处理函数会回的那句），不弹审批', async () => {
    const store = heldStore(null);
    const policy = panelsApprovalFor(undefined, () => store.live(Date.now()));

    expect(policy(call('s1'))).toEqual({
      kind: 'deny',
      reason: expect.stringContaining('你这个会话已经持有一场录制'),
    });
    expect(await approvalFor(call('s1'), { writes: true, policy })).toEqual({
      kind: 'deny',
      reason: expect.stringContaining(DIY_RECORD_PREPARE_TOOL),
    });
  });

  it('★★ 别的会话占着 ⇒ 也直接拒，并点名是谁占着', () => {
    const store = heldStore(null);
    const policy = panelsApprovalFor(undefined, () => store.live(Date.now()));

    const verdict = policy(call('s9'));
    expect(verdict?.kind).toBe('deny');
    expect(verdict?.kind === 'deny' ? verdict.reason : '').toContain('另一场录制还占着（s1）');
  });

  it('★ 完全权限（skipAsk）也不许把它问回来：这是"跑不成"，不是"要不要问"', async () => {
    const store = heldStore(null);
    const policy = panelsApprovalFor(undefined, () => store.live(Date.now()));

    expect(await approvalFor(call('s1'), { writes: true, policy, skipAsk: true })).toEqual({
      kind: 'deny',
      reason: expect.stringContaining('已经持有一场录制'),
    });
  });

  it('★ 没有活着的录制 / 没交取值器 ⇒ 照旧问（收工之后重新 prepare 要再点一次头）', async () => {
    const empty = panelsApprovalFor(undefined, () => null);

    expect(empty(call('s1'))?.kind).toBe('ask');
    expect(panelsApprovalFor(undefined)(call('s1'))?.kind).toBe('ask');
    expect(panelsApproval(call('s1'))?.kind).toBe('ask');
  });

  it('★ 过期的那一场不算占着：`live()` 自己会把它滤掉，这里不另判', () => {
    const store = heldStore(null);
    const later = Date.now() + 16 * 60 * 1000;
    const policy = panelsApprovalFor(undefined, () => store.live(later));

    expect(policy(call('s1'))?.kind).toBe('ask');
  });

  it('★ 只认这一把：录制活着时，别的面板写工具照旧问 / 照旧放行', () => {
    const store = heldStore(null);
    const policy = panelsApprovalFor(undefined, () => store.live(Date.now()));

    expect(policy({ name: 'workbench_panels_show', arguments: { id: 'issues' } })?.kind).toBe('ask');
    expect(policy({ name: 'workbench_diy_state', arguments: {} })).toEqual({ kind: 'allow' });
  });
});
