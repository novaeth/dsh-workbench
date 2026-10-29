import { describe, expect, it } from 'vitest';
import type { PreflightSnapshot, PreflightStep } from '@dsh-workbench/shared/host';
import { showsRawAll, showsRawDetails } from '../gate-text';
import { GATE_MOCKS } from '../gate-mock';

function snapshotOf(phase: PreflightSnapshot['phase'], steps: readonly PreflightStep[]): PreflightSnapshot {
  return { phase, steps, at: 0 };
}

describe('「详细输出（排障用）」只在有东西要排的时候出现', () => {
  it('★ 全绿（每步都有 detail）：不摆详细输出（版本号与 Everything looks good 对用户是噪音）', () => {
    const ready = GATE_MOCKS.find((item) => item.id === 'ready')?.snapshot;

    expect(ready, 'ready').toBeDefined();
    expect(showsRawDetails(ready as PreflightSnapshot)).toBe(false);
  });

  it('还在检测（已有 ok 的 detail、后面的步骤没轮到）：也不摆', () => {
    const checking = snapshotOf('checking', [
      { id: 'cli', status: 'ok', detail: '1.8.8' },
      { id: 'warm', status: 'running' },
    ]);

    expect(showsRawDetails(checking)).toBe(false);
  });

  it('★ 有 warn / failed 的步骤：摆出来（那几行原文才是排障要的证据）', () => {
    for (const item of GATE_MOCKS) {
      const trouble =
        item.snapshot.phase === 'failed' ||
        item.snapshot.steps.some((step) => step.status === 'warn' || step.status === 'failed');

      expect(showsRawDetails(item.snapshot), item.id).toBe(trouble);
    }
  });

  it('整轮 failed 但没有哪一步标 failed（防御）：仍然摆出来', () => {
    const failed = snapshotOf('failed', [{ id: 'cli', status: 'running' }]);

    expect(showsRawDetails(failed)).toBe(true);
  });
});

describe('只摆一份「详细输出」', () => {
  it('已经摆了专用面板（它自带一份详细输出）→ 底下那份汇总不再重复', () => {
    const failed = snapshotOf('failed', [{ id: 'runtime', status: 'failed', detail: 'MCP server 起不来' }]);

    expect(showsRawDetails(failed)).toBe(true);
    expect(showsRawAll(failed, true)).toBe(false);
  });

  it('没有专用面板、又确实有 warn → 汇总那份要摆', () => {
    const warned = snapshotOf('checking', [{ id: 'runtime', status: 'warn', detail: '2 个工具' }]);

    expect(showsRawAll(warned, false)).toBe(true);
  });

  it('全绿 → 两份都不摆', () => {
    const ready = snapshotOf('ready', [{ id: 'runtime', status: 'ok', detail: '32 个工具' }]);

    expect(showsRawAll(ready, false)).toBe(false);
    expect(showsRawAll(ready, true)).toBe(false);
  });
});
