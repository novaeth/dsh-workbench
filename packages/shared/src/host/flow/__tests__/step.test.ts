import { describe, expect, it } from 'vitest';

import type { FlowStepEvent } from '../types.js';
import { longTaskStepOf } from '../step.js';

const eventOf = (status: FlowStepEvent['status'], extra: Partial<FlowStepEvent> = {}): FlowStepEvent => ({
  stepId: 'read',
  title: '读目录',
  status,
  ...extra,
});

describe('longTaskStepOf：流程事件 → 长任务步骤的默认映射', () => {
  it('running 记成 start，文字用 title', () => {
    expect(longTaskStepOf(eventOf('running'))).toEqual({ kind: 'start', text: '读目录' });
  });

  it('ok 记成 succeed', () => {
    expect(longTaskStepOf(eventOf('ok'))).toEqual({ kind: 'succeed', text: '读目录' });
  });

  it('skipped 记成 info', () => {
    expect(longTaskStepOf(eventOf('skipped'))).toEqual({ kind: 'info', text: '读目录' });
  });

  it('failed 记成 fail', () => {
    expect(longTaskStepOf(eventOf('failed'))).toEqual({ kind: 'fail', text: '读目录' });
  });

  it('needs-login 带 loginUrl', () => {
    expect(longTaskStepOf(eventOf('needs-login', { loginUrl: 'https://example.com/login' }))).toEqual({
      kind: 'info',
      text: '读目录',
      loginUrl: 'https://example.com/login',
    });
  });

  it('message 盖过 title；没有 loginUrl 就不带那个键', () => {
    const step = longTaskStepOf(eventOf('running', { message: '正在读' }));
    expect(step).toEqual({ kind: 'start', text: '正在读' });
    expect('loginUrl' in step).toBe(false);
  });
});
