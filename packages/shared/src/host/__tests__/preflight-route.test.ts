import { describe, expect, it, vi } from 'vitest';
import { preflightHandler } from '../http.js';

const SNAPSHOT = { phase: 'ready', steps: [], at: 1 };

function handlerWith() {
  const run = vi.fn(async () => SNAPSHOT);
  return { run, handler: preflightHandler({ run, snapshot: () => SNAPSHOT }) };
}

describe('preflightHandler（体检那一拍带什么参数）', () => {
  it('平时（不带 hard）交给宿主自己判新鲜度', async () => {
    const { run, handler } = handlerWith();

    await handler(new URLSearchParams(''));

    expect(run).toHaveBeenCalledWith({ hard: false });
  });

  it('?hard=1 一路传到 run（用户按的那颗「重试」）', async () => {
    const { run, handler } = handlerWith();

    await handler(new URLSearchParams('hard=1'));

    expect(run).toHaveBeenCalledWith({ hard: true });
  });

  it('不管 run 跑没跑完，回的都是当前快照（页面靠 400ms 轮询看进度）', () => {
    const { handler } = handlerWith();

    expect(handler(new URLSearchParams(''))).toEqual({ ok: true, ...SNAPSHOT });
  });

  it('★ 先回上一轮的结果再起新一轮：run 一上来就把快照重置成 checking，也不许把它顶掉', () => {
    let current = { phase: 'failed', steps: [], at: 1 };
    const run = vi.fn(async () => {
      current = { phase: 'checking', steps: [], at: 2 };
      return current;
    });
    const handler = preflightHandler({ run, snapshot: () => current });

    const reply = handler(new URLSearchParams(''));

    expect(reply).toEqual({ ok: true, phase: 'failed', steps: [], at: 1 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(current.phase).toBe('checking');
  });

  it('★ 重试（hard）回的是新一轮的进度：别把上一轮的 failed 又顶回画面', () => {
    let current = { phase: 'failed', steps: [], at: 1 };
    const run = vi.fn(async () => {
      current = { phase: 'checking', steps: [], at: 2 };
      return current;
    });
    const handler = preflightHandler({ run, snapshot: () => current });

    const reply = handler(new URLSearchParams('hard=1'));

    expect(reply).toEqual({ ok: true, phase: 'checking', steps: [], at: 2 });
    expect(run).toHaveBeenCalledWith({ hard: true });
  });
});
