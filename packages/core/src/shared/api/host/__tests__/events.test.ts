import { describe, expect, it, vi } from 'vitest';
import { createFactLog } from '@dsh-workbench/shared/host';
import { createFactStream } from '../events';

function fakeRes(): {
  res: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(body?: string): void;
    write(chunk: string): void;
    writeHead(status: number, headers: Record<string, string>): void;
    on(event: 'close', listener: () => void): void;
  };
  chunks: string[];
  headers: Record<string, string>;
  close(): void;
  ended: () => string | undefined;
} {
  const chunks: string[] = [];
  const headers: Record<string, string> = {};
  let closed: (() => void) | null = null;
  let ended: string | undefined;
  return {
    chunks,
    headers,
    close: () => closed?.(),
    ended: () => ended,
    res: {
      statusCode: 0,
      setHeader(name, value) {
        headers[name] = value;
      },
      writeHead(status, next) {
        this.statusCode = status;
        Object.assign(headers, next);
      },
      end(body) {
        ended = body;
      },
      write(chunk) {
        chunks.push(chunk);
      },
      on(event, listener) {
        if (event === 'close') closed = listener;
      },
    },
  };
}

function frames(chunks: readonly string[]): Array<Record<string, unknown>> {
  return chunks
    .flatMap((chunk) => chunk.split('\n\n'))
    .filter((part) => part.startsWith('data: '))
    .map((part) => JSON.parse(part.slice('data: '.length)) as Record<string, unknown>);
}

describe('createFactStream', () => {
  it('★ 首帧带纪元 + 修订 + since 之后的差量（重连与首次打开都靠它对齐）', () => {
    const log = createFactLog({ epoch: 'e1' });
    log.bump(['panels']);
    const stream = createFactStream(log);
    const sink = fakeRes();

    stream.handler({ method: 'GET', url: '/workbench/events?since=0' }, sink.res);

    expect(sink.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    expect(sink.headers['cache-control']).toContain('no-transform');
    expect(frames(sink.chunks)[0]).toEqual({ type: 'sync', epoch: 'e1', rev: 1, facts: ['panels'] });
  });

  it('★ 连上之后每一笔写入立刻推一帧（不再等下一次轮询）', () => {
    const log = createFactLog({ epoch: 'e1' });
    const stream = createFactStream(log);
    const sink = fakeRes();
    stream.handler({ method: 'GET', url: '/workbench/events' }, sink.res);

    log.bump(['inventory/summary']);

    expect(frames(sink.chunks).at(-1)).toEqual({ type: 'bump', rev: 1, facts: ['inventory/summary'] });
    expect(stream.size()).toBe(1);
  });

  it('★ 已经看到的差量不再重发（since=当前修订 → 空差量）', () => {
    const log = createFactLog({ epoch: 'e1' });
    log.bump(['panels']);
    const stream = createFactStream(log);
    const sink = fakeRes();

    stream.handler({ method: 'GET', url: '/workbench/events?since=1' }, sink.res);

    expect(frames(sink.chunks)[0]).toMatchObject({ type: 'sync', rev: 1, facts: [] });
  });

  it('★ 客户端断开 → 退订（之后没人再往死掉的 socket 写）', () => {
    const log = createFactLog({ epoch: 'e1' });
    const stream = createFactStream(log);
    const sink = fakeRes();
    stream.handler({ method: 'GET', url: '/workbench/events' }, sink.res);
    const before = sink.chunks.length;

    sink.close();
    log.bump(['panels']);

    expect(stream.size()).toBe(0);
    expect(sink.chunks.length).toBe(before);
  });

  it('★ 外壳卸载（热重载）→ closeAll 真关连接，不留悬挂订阅', () => {
    const log = createFactLog({ epoch: 'e1' });
    const stream = createFactStream(log);
    const first = fakeRes();
    const second = fakeRes();
    stream.handler({ method: 'GET', url: '/workbench/events' }, first.res);
    stream.handler({ method: 'GET', url: '/workbench/events' }, second.res);

    stream.closeAll();
    log.bump(['panels']);

    expect(stream.size()).toBe(0);
    expect(first.ended()).toBeUndefined();
    expect(frames(first.chunks)).toHaveLength(1);
  });

  it('非 GET → 405（这条路只推，不收）', () => {
    const stream = createFactStream(createFactLog({ epoch: 'e1' }));
    const sink = fakeRes();

    stream.handler({ method: 'POST', url: '/workbench/events' }, sink.res);

    expect(sink.res.statusCode).toBe(405);
    expect(sink.chunks).toHaveLength(0);
  });

  it('★ 宿主不能流（没有 write）→ 一次性 JSON 降级，不抛（客户端据此回落轮询）', () => {
    const log = createFactLog({ epoch: 'e1' });
    log.bump(['panels']);
    const stream = createFactStream(log);
    const plain = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    };

    expect(() =>
      stream.handler({ method: 'GET', url: '/workbench/events?since=0' }, plain as never),
    ).not.toThrow();
    expect(JSON.parse(String(plain.end.mock.calls[0]?.[0]))).toMatchObject({
      ok: true,
      epoch: 'e1',
      rev: 1,
      facts: ['panels'],
    });
  });
});
