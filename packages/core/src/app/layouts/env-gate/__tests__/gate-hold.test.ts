import { describe, expect, it } from 'vitest';
import type { PreflightBridgeIssue, PreflightSnapshot } from '@dsh-workbench/shared/host';
import { createPreflight } from '@dsh-workbench/adapters-default';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { BROKEN_BRIDGE, GOOD_BRIDGE_REPORT } from '@/shared/api/host/__tests__/preflight-cases';
import { gateActionOf } from '../boot-gate';

const EXTENSION_MISSING = [
  'opencli v1.8.8 doctor (node v24.15.0)',
  '',
  '[OK] Daemon: running on port 19825 (v1.8.8)',
  '[MISSING] Extension: not connected',
  '[FAIL] Connectivity: failed (extension-not-connected)',
  '',
  'Issues:',
  '  • Daemon is running but the Chrome/Chromium extension is not connected.',
  'If the extension is not installed:',
  '  1. Download from https://github.com/jackwener/opencli/releases',
].join('\n');

function snapshotOf(phase: PreflightSnapshot['phase'], issues?: readonly PreflightBridgeIssue[]): PreflightSnapshot {
  return { phase, steps: [], at: 0, ...(issues === undefined ? {} : { bridgeIssues: issues }) };
}

describe('门什么时候撤、什么时候停', () => {
  it('就绪即撤 / 桥接坏了停住 / 没跑完接着等 / 失败停住', () => {
    expect(gateActionOf(snapshotOf('ready'))).toBe('close');
    expect(gateActionOf(snapshotOf('ready', ['extension']))).toBe('hold');
    expect(gateActionOf(snapshotOf('checking'))).toBe('wait');
    expect(gateActionOf(snapshotOf('failed'))).toBe('hold');
  });

  it('★ DIY 模式挂不起来：门也停在原地（就绪即撤 = 用户进去才发现「工作台 DIY 模式」整个不在）', () => {
    const at = (diyGap: PreflightSnapshot['diyGap']): PreflightSnapshot => ({
      phase: 'ready',
      steps: [],
      at: 0,
      ...(diyGap === undefined ? {} : { diyGap }),
    });
    const gap = { rows: ['tool-schedule'], detail: 'tool-schedule (…) : never started', command: 'npm i -g @deepseek-ai/dsh@latest' };

    expect(gateActionOf(at(gap))).toBe('hold');
    expect(gateActionOf(at(undefined))).toBe('close');
  });

  it('★ 扩展没连上：那一帧带着「怎么解决」的材料，门停在它上面（不是就绪即撤）', async () => {
    const fake = createFakeShell([{ stdout: '1.8.8\n' }, { stdout: EXTENSION_MISSING }]);
    const preflight = createPreflight({
      shell: fake.shell,
      warmReads: () => [['inventory', 'enterprises']],
    });

    const snapshot = await preflight.run();

    const bridge = snapshot.steps.find((step) => step.id === 'bridge');
    expect(snapshot.phase).toBe('ready');
    expect(snapshot.bridgeIssues).toEqual(['extension']);
    expect(bridge?.status).toBe('warn');
    expect(bridge?.command).toBeUndefined();
    expect(bridge?.detail ?? '').toContain('is not connected');
    expect(gateActionOf(snapshot)).toBe('hold');
    expect(fake.commands()).toEqual(['opencli --version', 'opencli doctor']);
  });
});

describe('修好之后再体检一次', () => {
  it('★ 桥接修好后按「重试」：上一轮的桥接问题不许留在快照上（否则门卡死在三行全绿的提示页）', async () => {
    const fake = createFakeShell([
      { stdout: '1.8.8\n' },
      { stdout: BROKEN_BRIDGE },
      { stdout: '1.8.8\n' },
      { stdout: GOOD_BRIDGE_REPORT },
    ]);
    const preflight = createPreflight({ shell: fake.shell });

    const first = await preflight.run();
    expect(gateActionOf(first)).toBe('hold');

    const second = await preflight.run({ hard: true });
    expect(second.steps.find((step) => step.id === 'bridge')?.status).toBe('ok');
    expect(second.bridgeIssues).toBeUndefined();
    expect(second.diyGap).toBeUndefined();
    expect(gateActionOf(second)).toBe('close');
  });
});
