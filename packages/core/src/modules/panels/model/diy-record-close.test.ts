import { beforeEach, describe, expect, it } from 'vitest';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import { takeHeldNotices } from '@/shared/api/host/diy-debug-act';
import { createDiyRig } from '../__tests__/diy-harness';
import type { ProbeStep } from '../__tests__/diy-harness';
import { ARM_OK, POST, URL, heldStore, line } from '../__tests__/record-fixtures';
import { releaseRecord, watchFinishStepOf } from './diy-record';
import { DIY_RECORD_READ_TOOL, DIY_RECORD_STOP_TOOL } from '../unit';

const finishedPayload = (): string =>
  JSON.stringify({
    ok: true,
    unhooked: 1,
    phase: 'finished',
    t0: 10,
    t1: 20,
    href: URL,
    here: URL,
    dropped: 0,
    calls: [POST()],
  });

const markerOf = (command: string): string => {
  if (command.includes("'tab' 'list'")) return 'cmd:tab-list';
  if (command.includes("'tab' 'close'")) return 'cmd:tab-close';
  if (command.includes("'eval'")) return 'cmd:eval';
  return 'cmd:other';
};

function recordingShell(plan: readonly ProbeStep[], order: string[]) {
  let index = 0;
  return {
    resolve(request: { command: string }) {
      order.push(markerOf(request.command));
      return request;
    },
    async execute() {
      const step = plan[Math.min(index, plan.length - 1)] ?? {};
      index += 1;
      return {
        result: async () => ({
          exitCode: step.exitCode ?? 0,
          timedOut: step.timedOut ?? false,
          aborted: false,
          stdout: { text: step.stdout ?? '', truncated: false },
          stderr: { text: step.stderr ?? '', truncated: false },
        }),
      };
    },
  } as unknown as DshShell;
}

describe('录制结束那一刻就关窗：先叫醒、再收掉那一扇', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
    takeHeldNotices('s1');
  });

  const held = () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    return record;
  };

  it('★★ 认到 finished ⇒ notice 先出去、接着 `tab list` + `tab close <page>` + **把租约也还掉**、然后收工', async () => {
    const record = held();
    const order: string[] = [];
    const agents = {
      get: () => {
        order.push('notice');
        return undefined;
      },
    };
    const ctx = { get: (key: string) => (key === 'agents' ? agents : undefined) } as unknown as DshHostContext;
    const shell = recordingShell(
      [
        { stdout: finishedPayload() },
        { stdout: '' },
        { stdout: JSON.stringify([{ page: 'p1', url: URL, title: '环境' }]) },
        { stdout: '{"closed":"p1"}' },
      ],
      order,
    );

    const out = await watchFinishStepOf({
      ctx,
      shell,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: true, delivered: true });
    expect(order).toEqual(['cmd:eval', 'notice', 'cmd:other', 'cmd:tab-list', 'cmd:tab-close', 'cmd:other']);
    expect(takeHeldNotices('s1')).toHaveLength(1);
  });

  it('★★ 那扇窗里还留着 opencli 会话自己那个 about:blank ⇒ 顺手也关掉，别攒着（然后把租约还掉，下一场才开新窗）', async () => {
    const record = held();
    const order: string[] = [];
    const ctx = { get: () => undefined } as unknown as DshHostContext;
    const shell = recordingShell(
      [
        { stdout: finishedPayload() },
        { stdout: '' },
        {
          stdout: JSON.stringify([
            { page: 'blank', url: 'about:blank', title: 'about:blank' },
            { page: 'p1', url: URL, title: '环境' },
          ]),
        },
        { stdout: '{"closed":"p1"}' },
        { stdout: '{"closed":"blank"}' },
      ],
      order,
    );

    const out = await watchFinishStepOf({
      ctx,
      shell,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: true, delivered: true });
    expect(order).toEqual([
      'cmd:eval',
      'cmd:other',
      'cmd:tab-list',
      'cmd:tab-close',
      'cmd:tab-close',
      'cmd:other',
    ]);
  });

  it('★ 关窗失败（tab list 报错 / 关窗那一拍抛了）⇒ 照旧收工，叫醒不受影响', async () => {
    const ctx = { get: () => undefined } as unknown as DshHostContext;
    const order: string[] = [];

    const failed = await watchFinishStepOf({
      ctx,
      shell: recordingShell(
        [
          { stdout: finishedPayload() },
          { stdout: '' },
          { stdout: '', stderr: 'tab list 挂了', exitCode: 1 },
          { stdout: '', stderr: '整会话 close 也没成', exitCode: 1 },
        ],
        order,
      ),
      command: '',
      sessionId: 's1',
      store: held(),
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(failed).toEqual({ stop: true, delivered: true });
    expect(takeHeldNotices('s1')).toHaveLength(1);

    let calls = 0;
    const throwing = {
      resolve: (request: { command: string }) => {
        order.push(markerOf(request.command));
        return request;
      },
      async execute() {
        calls += 1;
        if (calls > 1) throw new Error('shell 没了');
        return {
          result: async () => ({
            exitCode: 0,
            timedOut: false,
            aborted: false,
            stdout: { text: finishedPayload(), truncated: false },
            stderr: { text: '', truncated: false },
          }),
        };
      },
    } as unknown as DshShell;
    const boom = await watchFinishStepOf({
      ctx,
      shell: throwing,
      command: '',
      sessionId: 's1',
      store: held(),
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(boom).toEqual({ stop: true, delivered: true });
  });

  it('★★ 窗口已经关了之后读那一段：不抛、清单照旧（正文里是清单，不是"读不到"）', async () => {
    const record = heldStore(null);
    record.started('s1', 1, Date.now());
    record.finished('s1', 100, Date.now());
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: '1\n' },
        { stdout: line('POST', `${URL}/api/publish`, 15) },
      ],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as {
      rows: readonly unknown[];
      text: string;
    };

    expect(out.rows).toHaveLength(1);
    expect(out.text).toContain('录完了 · 1 条（⭐ 1）');
    expect(out.text).toContain('那一扇录制窗就收掉了');
    expect(built.commands.some((one) => one.includes("'eval'"))).toBe(false);
  });

  it('★★ 他没按「开始」就按了「结束」⇒ 台账也要落到 finished（区间从 0 起），不然读那一段会去碰页面、opencli 又补一个空白标签', async () => {
    const record = heldStore(null);
    const order: string[] = [];
    const ctx = { get: () => undefined } as unknown as DshHostContext;

    const out = await watchFinishStepOf({
      ctx,
      shell: recordingShell(
        [
          { stdout: finishedPayload() },
          { stdout: '' },
          { stdout: '[]' },
        ],
        order,
      ),
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: true, delivered: true });
    expect(record.live(Date.now())?.phase).toBe('finished');
    expect(record.live(Date.now())?.t0).toBe(10);
  });

  it('★★ 页面从来没开始过（`t0` 是 null）也封口：区间从 0 起 —— 那一段的请求一条都不许被筛掉', async () => {
    const record = heldStore(null);
    const ctx = { get: () => undefined } as unknown as DshHostContext;

    const out = await watchFinishStepOf({
      ctx,
      shell: recordingShell(
        [
          {
            stdout: JSON.stringify({
              ok: true,
              unhooked: 1,
              phase: 'finished',
              t0: null,
              t1: 20,
              href: URL,
              here: URL,
              dropped: 0,
              calls: [],
            }),
          },
          { stdout: '' },
          { stdout: '[]' },
        ],
        [],
      ),
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: true, delivered: true });
    expect(record.live(Date.now())?.phase).toBe('finished');
    expect(record.live(Date.now())?.t0).toBe(0);
  });

  it('★ 已经 finished 的那一场：看护那一拍顺手把窗收掉并收工（不再空转）', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    record.finished('s1', at + 5, at + 5);
    const order: string[] = [];
    const shell = recordingShell([{ stdout: '[]' }], order);

    const out = await watchFinishStepOf({
      ctx: { get: () => undefined } as unknown as DshHostContext,
      shell,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(out).toEqual({ stop: true, delivered: false });
    expect(order).toEqual(['cmd:tab-list']);
  });

  it('★ releaseRecord 仍然 tolerant：标签已经不在（空列表）⇒ 不报"收窗失败"', async () => {
    const fake = rig.fakeShell([{ stdout: '' }, { stdout: '[]' }]);

    const cleaned = await releaseRecord({
      shell: fake.shell,
      command: '',
      session: BROWSER_RECORD_SESSION,
      url: URL,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(cleaned).toEqual({ tab: true, capture: true });
  });

  it('★ 收工那一拍也不自相矛盾：标签已被结束那一拍关掉 ⇒ 话说"收掉了"，不说"没关掉"', async () => {
    const record = heldStore(null);
    record.started('s1', 1, Date.now());
    record.finished('s1', 100, Date.now());
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: ARM_OK({ phase: 'finished' }) },
        { stdout: finishedPayload() },
        { stdout: '1\n' },
        { stdout: line('POST', `${URL}/api/publish`, 15) },
        { stdout: 'ok\n' },
        { stdout: '' },
        { stdout: '' },
        { stdout: '[]' },
      ],
    });

    const out = (await built.tool(DIY_RECORD_STOP_TOOL).execute({}, rig.diyExec())) as {
      cleaned: { readonly tab: boolean; readonly capture: boolean };
      text: string;
    };

    expect(out.cleaned.tab).toBe(true);
    expect(out.text).toContain('录制窗那个标签收掉了');
    expect(out.text).not.toContain('那个标签没关掉');
  });
});
