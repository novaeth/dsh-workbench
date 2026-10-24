import { describe, expect, it } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { openRecordPage, samePageOf } from './diy-record-open';

const WANT = 'https://tracker.example.com/p/DEMO/assignments/issues';

type Plan = { readonly stdout?: string; readonly stderr?: string; readonly exitCode?: number };

function shellOf(plan: readonly Plan[], seen: string[]) {
  let index = 0;
  return {
    resolve(request: { command: string }) {
      seen.push(request.command);
      return request;
    },
    async execute() {
      const step = plan[Math.min(index, plan.length - 1)] ?? {};
      index += 1;
      return {
        result: async () => ({
          exitCode: step.exitCode ?? 0,
          timedOut: false,
          aborted: false,
          stdout: { text: step.stdout ?? '', truncated: false },
          stderr: { text: step.stderr ?? '', truncated: false },
        }),
      };
    },
  } as unknown as DshShell;
}

const href = (url: string): string => `{"href":${JSON.stringify(url)}}`;

const call = (shell: DshShell) =>
  openRecordPage({ shell, command: '', session: 'workbench-rec', url: WANT, captureFile: '/w/shots/rec-demo.jsonl' });

describe('开录制那一页：开完必须核地址，核不过就回落到 open', () => {
  it('★★ 开出来就是我们那一页 ⇒ ok，且不去发 open', async () => {
    const seen: string[] = [];
    const out = await call(shellOf([{}, { stdout: '[]' }, {}, {}, { stdout: href(WANT) }], seen));
    expect(out).toEqual({ ok: true, at: WANT, why: '' });
    expect(seen.some((one) => one.includes("'open'"))).toBe(false);
  });

  it('★★ 开出来是空白页 ⇒ 回落 open；open 之后对了 ⇒ ok', async () => {
    const seen: string[] = [];
    const out = await call(
      shellOf([{}, { stdout: '[]' }, {}, {}, { stdout: href('about:blank') }, {}, {}, { stdout: href(`${WANT}/`) }], seen),
    );
    expect(out.ok).toBe(true);
    expect(seen.some((one) => one.includes("'open'"))).toBe(true);
  });

  it('★★ 两次都不是 ⇒ ok:false，`at` 是它真实在哪 —— 不许假装开好了', async () => {
    const seen: string[] = [];
    const out = await call(
      shellOf([{}, { stdout: '[]' }, {}, {}, { stdout: href('about:blank') }, {}, {}, { stdout: href('about:blank') }], seen),
    );
    expect(out.ok).toBe(false);
    expect(out.at).toBe('about:blank');
    expect(out.why).toContain('没开起来');
  });

  it('★ `tab new` 本身报错 ⇒ ok:false，说清是开不了窗', async () => {
    const seen: string[] = [];
    const out = await call(shellOf([{}, { stdout: '[]' }, { stdout: '', stderr: 'no such window', exitCode: 1 }], seen));
    expect(out.ok).toBe(false);
    expect(out.why).toContain('开不了录制窗');
  });

  it('★ 开之前先收这条会话的残留（否则新页会开进旧窗、不顶前台）', async () => {
    const seen: string[] = [];
    await call(shellOf([{}, { stdout: '[]' }, {}, {}, { stdout: href(WANT) }], seen));
    expect(seen[0]).toContain('.pid');
    expect(seen.some((one) => one.includes("'tab' 'list'"))).toBe(true);
  });

  it('★ samePageOf：末尾斜杠 / 锚点 / 查询串都不算开错页', () => {
    expect(samePageOf(`${WANT}/`, WANT)).toBe(true);
    expect(samePageOf(`${WANT}#detail`, WANT)).toBe(true);
    expect(samePageOf(`${WANT}?a=1`, WANT)).toBe(true);
    expect(samePageOf('about:blank', WANT)).toBe(false);
    expect(samePageOf('', WANT)).toBe(false);
    expect(samePageOf('https://tracker.example.com/p/DEMO/assignments', WANT)).toBe(false);
  });
});
