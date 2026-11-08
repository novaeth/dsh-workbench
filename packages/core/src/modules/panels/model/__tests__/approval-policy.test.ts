import { describe, expect, it } from 'vitest';
import { DIY_RECORD_PREPARE_TOOL, LONG_TASKS_STOP_TOOL, panelsUnit } from '../../unit';
import { createToolbox } from '../toolbox';
import { panelsApproval, panelsApprovalFor } from '../approval-policy';

const toolbox = createToolbox({ manifests: () => [panelsUnit] });

describe('审批策略入口', () => {
  it('快照版（没有落点）不查长任务列表：停机直接 allow，带落点的那一份才会解释给谁', () => {
    expect(panelsApproval({ name: LONG_TASKS_STOP_TOOL, arguments: {} })).toEqual({ kind: 'allow' });
  });

  it('★ 录制还占着：同会话再 prepare 就说 already-held，别的会话说 held-by-other', () => {
    const held = {
      sessionId: 's-1',
      url: 'https://example.com',
      captureFile: 'shots/rec-x.jsonl',
      startedAt: 1,
    };
    const policy = panelsApprovalFor(undefined, () => held as never, undefined, undefined, toolbox);

    const same = policy({ name: DIY_RECORD_PREPARE_TOOL, arguments: {}, session: 's-1' });
    const other = policy({ name: DIY_RECORD_PREPARE_TOOL, arguments: {}, session: 's-2' });

    expect(same?.kind).toBe('deny');
    expect(same?.kind === 'deny' ? same.reason : '').not.toBe('');
    expect(other?.kind).toBe('deny');
    expect(other?.kind === 'deny' ? other.reason : '').not.toBe('');
  });

  it('开包交给 toolbox 的判定，不自己再写一份', () => {
    const policy = panelsApprovalFor(undefined, undefined, undefined, undefined, toolbox);

    expect(policy({ name: 'workbench_toolbox_open', arguments: { targets: ['manage'] } })?.kind).toBe('ask');
  });
});
