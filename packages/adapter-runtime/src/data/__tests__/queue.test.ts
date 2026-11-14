import { describe, expect, it } from 'vitest';
import { createSeam, type DshShell } from '@dsh-workbench/shared/host';
import { createDataReader, type QueueWaitEvent } from '../index.js';

function slowReader(delayMs: number, queueWaitMs?: number, onQueue?: (event: QueueWaitEvent) => void) {
  let running = 0;
  let peak = 0;
  const calls: Array<{ command: string; signal?: AbortSignal }> = [];
  const shell = {
    resolve(request: { command: string; signal?: AbortSignal }) {
      calls.push(request);
      return request;
    },
    async execute() {
      running += 1;
      peak = Math.max(peak, running);
      return {
        async result() {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          running -= 1;
          return {
            exitCode: 0,
            timedOut: false,
            aborted: false,
            stdout: { text: JSON.stringify({ ok: true }), truncated: false },
            stderr: { text: '', truncated: false },
          };
        },
      };
    },
  } as unknown as DshShell;
  const seam = createSeam({ shell, runtimeRoot: '/tmp/wb-queue-test' });
  return {
    reader: createDataReader({
      seam,
      channel: false,
      ...(queueWaitMs === undefined ? {} : { queueWaitMs }),
      ...(onQueue === undefined ? {} : { onQueue }),
    }),
    calls,
    peak: () => peak,
  };
}

const read = { kind: 'browser' as const, script: 'return 1' };

describe('DataReader · 同会话队列', () => {
  it('同 session 三次并发 → 峰值 1', async () => {
    const { reader, peak } = slowReader(5);
    await Promise.all([reader.read(read), reader.read(read), reader.read(read)]);
    expect(peak()).toBe(1);
  });

  it('不同 session 仍然并行 → 峰值 2', async () => {
    const { reader, peak } = slowReader(10);
    await Promise.all([
      reader.read({ ...read, session: 'a' }),
      reader.read({ ...read, session: 'b' }),
    ]);
    expect(peak()).toBe(2);
  });

  it('排队中被停：立刻返回 aborted，不占队头', async () => {
    const { reader } = slowReader(20);
    const first = reader.read(read);
    const controller = new AbortController();
    const second = reader.read(read, { signal: controller.signal });
    controller.abort();
    const out = await second;
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe('aborted');
    await first;
  });

  it('排队等待可观测：每次 acquire 都回报 waitedMs', async () => {
    const events: QueueWaitEvent[] = [];
    const { reader } = slowReader(10, undefined, (event) => events.push(event));
    await Promise.all([reader.read(read), reader.read(read), reader.read(read)]);
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.outcome === 'acquired')).toBe(true);
    expect(events.some((event) => event.waitedMs >= 1)).toBe(true);
  });

  it('排队超过上限：回 timeout，不无限等', async () => {
    const { reader } = slowReader(20, 1);
    const first = reader.read(read);
    const second = await reader.read(read);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('timeout');
    await first;
  });
});
