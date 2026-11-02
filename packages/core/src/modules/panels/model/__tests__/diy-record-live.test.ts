import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { fakeSeamOf } from '../../__tests__/seam-fake';
import {
  LIVE_POLL_MS,
  captureTickOnce,
  filterStaticLines,
  keepCaptureFile,
  liveCaptureOf,
  readCaptureLines,
  readCaptureLinesWithKey,
  readCaptureRound,
  readCaptureText,
  startLiveCapture,
  stopLiveCapture,
} from '@/shared/api/host/diy-capture-live';

interface Step {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
}

function fakeShell(steps: readonly Step[]) {
  const lines: string[] = [];
  let index = 0;
  const shell = {
    resolve(request: { command: string }) {
      lines.push(request.command);
      return request;
    },
    async execute() {
      const step = steps[Math.min(index, steps.length - 1)] ?? {};
      index += 1;
      return {
        result: async () => ({
          exitCode: step.exitCode === undefined ? 0 : step.exitCode,
          timedOut: step.timedOut ?? false,
          aborted: false,
          stdout: { text: step.stdout ?? '', truncated: false },
          stderr: { text: step.stderr ?? '', truncated: false },
        }),
      };
    },
  };
  return { seam: fakeSeamOf(shell as unknown as DshShell), lines };
}

const work = mkdtempSync(join(tmpdir(), 'dsh-live-'));
const file = join(work, 'rec.jsonl');

afterEach(() => {
  stopLiveCapture(file);
  for (const suffix of ['', '.first', '.last', '.round']) rmSync(`${file}${suffix}`, { force: true });
});

describe('filterStaticLines', () => {
  it('entries 里的静态资源被丢掉，剩下的整行重写', () => {
    const raw = JSON.stringify({
      entries: [
        { url: 'https://a.test/api/x', method: 'GET' },
        { url: 'https://a.test/logo.png', method: 'GET' },
      ],
    });
    expect(JSON.parse(filterStaticLines(raw))).toEqual({ entries: [{ url: 'https://a.test/api/x', method: 'GET' }] });
  });

  it('全是静态就整行丢掉', () => {
    const raw = JSON.stringify({ entries: [{ url: 'https://a.test/a.js' }] });
    expect(filterStaticLines(raw)).toBe('');
  });

  it('整段多行 JSON（opencli --raw 的输出）也压成一行', () => {
    const raw = JSON.stringify(
      {
        entries: [
          { url: 'https://a.test/api/x', method: 'GET' },
          { url: 'https://a.test/logo.png', method: 'GET' },
        ],
      },
      null,
      2,
    );
    const out = filterStaticLines(raw);
    expect(out.split('\n')).toHaveLength(1);
    expect(JSON.parse(out)).toEqual({ entries: [{ url: 'https://a.test/api/x', method: 'GET' }] });
  });

  it('整段多行 JSON 且全是静态：整段丢掉', () => {
    const raw = JSON.stringify({ entries: [{ url: 'https://a.test/a.js' }] }, null, 2);
    expect(filterStaticLines(raw)).toBe('');
  });

  it('不是 entries 的行、以及不是 JSON 的行，原样保留', () => {
    const plain = JSON.stringify({ url: 'https://a.test/a.js', method: 'GET' });
    expect(filterStaticLines(plain)).toBe(plain);
    expect(filterStaticLines('not json')).toBe('not json');
  });
});

describe('captureTickOnce', () => {
  it('跑一次快照：写 .first，把过滤后的行追加进文件', async () => {
    writeFileSync(file, '', 'utf8');
    const { seam, lines } = fakeShell([{ stdout: JSON.stringify({ entries: [{ url: 'https://a.test/api/x' }] }) }]);
    const round = await captureTickOnce(seam, 'opencli', 'sess', file);

    expect(round).toBe('ok');
    expect(lines[0]).toContain(`'network' '--all' '--raw'`);
    expect(readCaptureRound(file)).toBe('ok');
    expect(readFileSync(file, 'utf8')).toContain('https://a.test/api/x');
  });

  it('快照失败：.first 记 fail，文件不追加', async () => {
    writeFileSync(file, '', 'utf8');
    const { seam } = fakeShell([{ exitCode: 1 }]);
    expect(await captureTickOnce(seam, 'opencli', 'sess', file)).toBe('fail');
    expect(readCaptureRound(file)).toBe('fail');
    expect(readFileSync(file, 'utf8')).toBe('');
  });
});

describe('startLiveCapture / stopLiveCapture', () => {
  it('开始：清空文件、臂上 --follow、登记在册；停：出册', async () => {
    writeFileSync(file, 'old\n', 'utf8');
    const { seam, lines } = fakeShell([{ stdout: 'armed\n' }]);

    expect(await startLiveCapture({ seam, command: 'opencli', session: 'sess', file })).toBe(true);
    expect(lines[0]).toContain(`'network' '--follow' '--all'`);
    expect(readFileSync(file, 'utf8')).toContain('armed');
    expect(liveCaptureOf(file)).toBe(true);

    expect(stopLiveCapture(file)).toBe(true);
    expect(liveCaptureOf(file)).toBe(false);
    expect(stopLiveCapture(file)).toBe(false);
  });

  it('起不来就返回 false，不登记', async () => {
    const shell = {
      resolve(request: { command: string }) {
        return request;
      },
      async execute(): Promise<never> {
        throw new Error('spawn 失败');
      },
    };
    const seam = fakeSeamOf(shell as unknown as DshShell);
    expect(await startLiveCapture({ seam, command: 'opencli', session: 'sess', file })).toBe(false);
    expect(liveCaptureOf(file)).toBe(false);
  });
});

describe('轮询排拍', () => {
  it('首拍不抢跑；到点跑一拍；stop 之后不再跑', async () => {
    vi.useFakeTimers();
    try {
      const { seam, lines } = fakeShell([{ stdout: 'armed\n' }, { stdout: '' }]);
      await startLiveCapture({ seam, command: 'opencli', session: 'sess', file });
      const ticks = (): number => lines.filter((one) => one.includes("'network' '--all' '--raw'")).length;

      expect(ticks()).toBe(0);
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS + 10);
      expect(ticks()).toBe(1);

      stopLiveCapture(file);
      await vi.advanceTimersByTimeAsync(LIVE_POLL_MS * 3);
      expect(ticks()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('读侧：行数 / 轮次 / 尾部 / 按 key', () => {
  it('行数按换行算，尾部按行截，按 key 只回前 20 行', () => {
    const text = ['{"key":"k1"}', '{"key": "k2"}', '{"key":"other"}'].join('\n');
    writeFileSync(file, `${text}\n`, 'utf8');

    expect(readCaptureLines(file)).toBe(3);
    expect(readCaptureText(file).text).toBe(`${text}\n`);
    expect(readCaptureLinesWithKey(file, 'k1')).toBe('{"key":"k1"}\n');
    expect(readCaptureLinesWithKey(file, 'k2')).toBe('{"key": "k2"}\n');
    expect(readCaptureLinesWithKey(file, 'nope')).toBe('');
  });

  it('文件不在：行数 0、尾部空、轮次空', () => {
    expect(readCaptureLines(join(work, 'missing.jsonl'))).toBe(0);
    expect(readCaptureText(join(work, 'missing.jsonl')).text).toBe('');
    expect(readCaptureRound(join(work, 'missing.jsonl'))).toBe('');
  });

  it('keepCaptureFile：搬到 .last，空文件不算留住', () => {
    writeFileSync(file, 'x\n', 'utf8');
    expect(keepCaptureFile(join(work, 'none.jsonl'))).toBe(false);
    expect(keepCaptureFile(file)).toBe(true);
    expect(readFileSync(`${file}.last`, 'utf8')).toBe('x\n');
    rmSync(`${file}.last`, { force: true });
  });
});
