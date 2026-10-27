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
});
