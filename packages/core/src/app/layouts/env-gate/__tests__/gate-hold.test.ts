import { describe, expect, it } from 'vitest';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import { gateActionOf } from '../boot-gate';

function snapshotOf(
  phase: PreflightSnapshot['phase'],
  extra: Partial<PreflightSnapshot> = {},
): PreflightSnapshot {
  return { phase, steps: [], at: 0, ...extra };
}

const EXTENSION_MISSING: PreflightSnapshot = snapshotOf('ready', {
  bridgeIssues: ['extension'],
  steps: [
    { id: 'cli', status: 'ok', detail: '1.8.8' },
    {
      id: 'bridge',
      status: 'warn',
      detail: 'opencli doctor 说扩展没连上（is not connected）',
    },
  ],
});

const BROKEN: PreflightSnapshot = snapshotOf('ready', {
  bridgeIssues: ['daemon', 'extension'],
  steps: [{ id: 'bridge', status: 'warn', detail: 'daemon 没起来（not reachable）' }],
});

const RECOVERED: PreflightSnapshot = snapshotOf('ready', {
  steps: [
    { id: 'cli', status: 'ok', detail: '1.8.8' },
    { id: 'bridge', status: 'ok', detail: 'Everything looks good!' },
  ],
});

describe('门什么时候撤、什么时候停', () => {
  it('就绪即撤 / 桥接坏了停住 / 没跑完接着等 / 失败停住', () => {
    expect(gateActionOf(snapshotOf('ready'))).toBe('close');
    expect(gateActionOf(snapshotOf('ready', { bridgeIssues: ['extension'] }))).toBe('hold');
    expect(gateActionOf(snapshotOf('checking'))).toBe('wait');
    expect(gateActionOf(snapshotOf('failed'))).toBe('hold');
  });

  it('★ DIY 模式挂不起来：门也停在原地（就绪即撤 = 用户进去才发现「工作台 DIY 模式」整个不在）', () => {
    const gap = {
      rows: ['tool-schedule'],
      detail: 'tool-schedule (…) : never started',
      command: 'npm i -g @deepseek-ai/dsh@latest',
    };

    expect(gateActionOf(snapshotOf('ready', { diyGap: gap }))).toBe('hold');
    expect(gateActionOf(snapshotOf('ready'))).toBe('close');
  });

  it('★ 扩展没连上：那一帧带着「怎么解决」的材料，门停在它上面（不是就绪即撤）', () => {
    const bridge = EXTENSION_MISSING.steps.find((step) => step.id === 'bridge');

    expect(EXTENSION_MISSING.phase).toBe('ready');
    expect(EXTENSION_MISSING.bridgeIssues).toEqual(['extension']);
    expect(bridge?.status).toBe('warn');
    expect(bridge?.command).toBeUndefined();
    expect(bridge?.detail ?? '').toContain('is not connected');
    expect(gateActionOf(EXTENSION_MISSING)).toBe('hold');
  });
});

describe('修好之后再体检一次', () => {
  it('★ 桥接修好后按「重试」：上一轮的桥接问题不许留在快照上（否则门卡死在三行全绿的提示页）', () => {
    expect(gateActionOf(BROKEN)).toBe('hold');
    expect(EXTENSION_MISSING.bridgeIssues).toEqual(['extension']);

    expect(RECOVERED.steps.find((step) => step.id === 'bridge')?.status).toBe('ok');
    expect(RECOVERED.bridgeIssues).toBeUndefined();
    expect(RECOVERED.diyGap).toBeUndefined();
    expect(gateActionOf(RECOVERED)).toBe('close');
  });
});
