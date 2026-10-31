import { describe, expect, it } from 'vitest';

import { headlineOf, runIsLive, sampleFlow, type SampleRun } from './flow';

const run = (over: Partial<SampleRun> = {}): SampleRun => ({
  id: 'run-1',
  status: 'running',
  step: '',
  steps: [],
  ...over,
});

describe('样板流程的模型', () => {
  it('两步：先读目录、再汇总，步骤 id 就是动作名', () => {
    const flow = sampleFlow();
    expect(flow.steps.map((step) => ('action' in step ? step.action : 'sub'))).toEqual(['read', 'summarize']);
    expect(flow.target).toEqual({ $ref: 'in.path' });
  });

  it('只有 running / needs-login 算还在跑', () => {
    expect(runIsLive(run())).toBe(true);
    expect(runIsLive(run({ status: 'needs-login' }))).toBe(true);
    expect(runIsLive(run({ status: 'ok' }))).toBe(false);
    expect(runIsLive(run({ status: 'failed' }))).toBe(false);
    expect(runIsLive(run({ status: 'stopped' }))).toBe(false);
  });

  it('标题按五态与当前步骤说人话', () => {
    expect(headlineOf(run())).toBe('样板流程正在跑');
    expect(headlineOf(run({ step: '读目录' }))).toBe('样板流程：读目录');
    expect(headlineOf(run({ status: 'ok' }))).toBe('样板流程跑完了');
    expect(headlineOf(run({ status: 'failed' }))).toBe('样板流程失败');
    expect(headlineOf(run({ status: 'stopped' }))).toBe('样板流程已停止');
    expect(headlineOf(run({ status: 'needs-login' }))).toBe('样板流程要登录');
  });
});
