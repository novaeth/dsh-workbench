import { beforeEach, describe, expect, it } from 'vitest';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import { takeHeldNotices } from '@/shared/api/host/diy-debug-act';
import { createDiyRig } from '../__tests__/diy-harness';
import { ARM_OK, POST, URL, heldStore, line } from '../__tests__/record-fixtures';
import { STATIC_URL_PATTERN, watchRecordFinish, watchRoundOf } from './diy-record';
import { DIY_RECORD_READ_TOOL } from '../unit';

const recording = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ ok: true, phase: 'recording', t0: 1, t1: null, shots: 0, shotsAt: null, calls: [], ...extra });

const finishedPage = (at: number): string =>
  JSON.stringify({ ok: true, phase: 'finished', t0: at, t1: at + 5, shots: 0, shotsAt: null, calls: [POST()] });

describe('录制交接的门铃：页面内长轮询（每一轮一条 eval，命中就立刻做那一拍）', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
    takeHeldNotices('s1');
  });

  const deps = (built: ReturnType<ReturnType<typeof createDiyRig>['harness']>, record: ReturnType<typeof heldStore>) => ({
    ctx: built.ctx as unknown as DshHostContext,
    shell: built.ctx.get('shell') as unknown as DshShell,
    command: '',
    sessionId: 's1',
    store: record,
    url: URL,
    captureFile: '/w/shots/rec-demo.jsonl',
  });

  const settle = async (): Promise<void> => {
    for (let round = 0; round < 6; round += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('★★ 每一轮恰好一条 `eval`（**没有 `wait`**）；读数里 beat:true ⇒ 记进台账', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [{ stdout: recording({ t0: at, beat: true, beatKind: 'start' }) }],
    });

    const out = await watchRoundOf(deps(built, record));

    expect(out.stop).toBe(false);
    expect(built.commands).toHaveLength(1);
    expect(built.commands[0]).toContain("'eval'");
    expect(built.commands[0]).toContain(BROWSER_RECORD_SESSION);
    expect(built.commands[0]).not.toContain("'wait'");
    const live = record.live(Date.now());
    expect(live?.beats).toBe(1);
    expect(live?.beatMs).toBeGreaterThanOrEqual(0);
    expect(live?.phase).toBe('recording');
  });

  it('★★ 读数里没有 beat（没人按 / 兜底那一轮）⇒ 照旧做那一拍，台账不动', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [{ stdout: recording({ t0: at }) }],
    });

    const out = await watchRoundOf(deps(built, record));

    expect(out.stop).toBe(false);
    expect(built.commands).toHaveLength(1);
    expect(record.live(Date.now())?.beats).toBe(0);
    expect(record.live(Date.now())?.beatMs).toBe(0);
  });

  it('★ 结束那一刻：封口 + 叫醒 + `tab list` / `tab close` + 收工，**不再排下一轮**', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: recording({ t0: at, beat: true, beatKind: 'start' }) },
        { stdout: finishedPage(at) },
        { stdout: '' },
        { stdout: JSON.stringify([{ page: 'p1', url: URL, title: '环境' }]) },
        { stdout: '{"closed":"p1"}' },
      ],
    });

    watchRecordFinish(deps(built, record));
    await settle();

    expect(built.commands.filter((one) => one.includes("'eval'"))).toHaveLength(2);
    expect(built.commands.some((one) => one.includes("'tab' 'list'"))).toBe(true);
    expect(built.commands.some((one) => one.includes("'tab' 'close'"))).toBe(true);
    expect(built.commands.some((one) => one.includes('.pid'))).toBe(true);
    expect(record.live(Date.now())?.phase).toBe('finished');
    expect(record.live(Date.now())?.beats).toBe(1);
  });

  it('★ 读页面那一拍自己抛了（shell 没了）⇒ 不丢兜底、台账不动', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const broken = {
      resolve: (spec: unknown) => spec,
      execute: () => Promise.reject(new Error('shell 没了')),
    } as unknown as DshShell;

    const out = await watchRoundOf({
      ctx: {} as DshHostContext,
      shell: broken,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out.stop).toBe(false);
    expect(record.live(Date.now())?.beats).toBe(0);
  });

  it('★★ `_record_read` 正文里带上门铃那一行（命中过才出）', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    record.beat('s1', 42, Date.now());
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: ARM_OK({ phase: 'finished' }) },
        {
          stdout: JSON.stringify({
            ok: true,
            phase: 'finished',
            t0: 10,
            t1: 20,
            href: URL,
            here: URL,
            dropped: 0,
            calls: [POST()],
          }),
        },
        { stdout: '1\n' },
        { stdout: line('POST', `${URL}/api/publish`, 15) },
      ],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as {
      text: string;
      beats: number;
      beatMs: number;
    };

    expect(out.beats).toBe(1);
    expect(out.beatMs).toBe(42);
    expect(out.text).toContain('门铃：1 次（最近 42 毫秒）');
  });

  it('★ 捕获那行的 URL 过滤仍然滤静态资源，且**不再需要**"门铃"那一条（没有那条请求了）', () => {
    const re = new RegExp(STATIC_URL_PATTERN, 'i');

    expect(re.test('https://inventory.example.com/assets/app.js')).toBe(true);
    expect(re.test('data:image/png;base64,AAAA')).toBe(true);
    expect(re.test('https://inventory.example.com/api/publish')).toBe(false);
    expect(STATIC_URL_PATTERN).not.toContain('__dsh_beat');
  });
});
