import { describe, expect, it } from 'vitest';
import type { FlowAction, FlowActionContext } from '../flow/types.js';
import { withLoginRetry } from '../flow/login-retry.js';

function context(signal: AbortSignal) {
  const logins: string[] = [];
  const value: FlowActionContext = {
    signal,
    runId: 'run-1',
    workspace: '/w/a',
    stepId: 'read',
    log: () => {},
    login: (url) => {
      logins.push(url);
    },
    need: () => {},
  };
  return { value, logins };
}

function authError(): Error {
  return Object.assign(new Error('未登录'), {
    code: 'AUTH_REQUIRED',
    loginUrl: 'https://example.test/login',
  });
}

const tick = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('withLoginRetry：认证失败就等登录', () => {
  it('★★ 第一次认证失败 → login(url) → 等一拍重试成功', async () => {
    const controller = new AbortController();
    const ctx = context(controller.signal);
    let attempts = 0;
    const action: FlowAction = async () => {
      attempts += 1;
      if (attempts === 1) throw authError();
      return 'ok';
    };

    const result = await withLoginRetry(action, { everyMs: 0 })({}, ctx.value);

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
    expect(ctx.logins).toEqual(['https://example.test/login']);
  });

  it('★★ 非认证错误原样抛出，不登录、不重试', async () => {
    const controller = new AbortController();
    const ctx = context(controller.signal);
    const boom = new Error('boom');
    const action: FlowAction = async () => {
      throw boom;
    };

    await expect(withLoginRetry(action, { everyMs: 0 })({}, ctx.value)).rejects.toBe(boom);
    expect(ctx.logins).toEqual([]);
  });

  it('★★ 重试期间停止：动作被 abort，不无限挂着', async () => {
    const controller = new AbortController();
    const ctx = context(controller.signal);
    const action: FlowAction = async () => {
      throw authError();
    };
    const pending = withLoginRetry(action, { everyMs: 10, maxMs: 0 })({}, ctx.value);
    await tick();
    controller.abort();

    await expect(pending).rejects.toThrow('已停止');
    expect(ctx.logins).toEqual(['https://example.test/login']);
  });

  it('★★ 到了上限就不再重试，但动作继续等登录；停止才结束', async () => {
    const controller = new AbortController();
    const ctx = context(controller.signal);
    let attempts = 0;
    const action: FlowAction = async () => {
      attempts += 1;
      throw authError();
    };
    const pending = withLoginRetry(action, { everyMs: 1, maxMs: 1 })({}, ctx.value);
    await tick(5);
    const atLimit = attempts;
    controller.abort();

    await expect(pending).rejects.toThrow('已停止');
    expect(atLimit).toBeGreaterThan(0);
    expect(ctx.logins.length).toBe(atLimit);
  });
});
