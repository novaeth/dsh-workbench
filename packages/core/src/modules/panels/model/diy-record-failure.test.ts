import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';
import { RECORD_STALE_MS } from '@dsh-workbench/shared/host';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import { takeHeldNotices } from '@/shared/api/host/diy-debug-act';
import { createDiyRig } from '../__tests__/diy-harness';
import { ARM_OK, GET, POST, heldStore, line } from '../__tests__/record-fixtures';
import { foreignDomainText, releaseQuietly, watchFinishStepOf } from './diy-record';
import { RECORD_ARM_SCRIPT } from './diy-record-scripts';
import { domainOf, readDomainsOf, type RecordListRow } from './diy-record-text';
import { DIY_RECORD_PREPARE_TOOL, DIY_RECORD_READ_TOOL, DIY_RECORD_STOP_TOOL } from '../unit';

describe('录制交接：半路失败与实话（每一档都单独说）', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
  });

  const URL2 = 'https://inventory.example.com/env';

  it('★★ 开不了窗：当场抛，且不留状态（一场都不许留在台账里）', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [{ stdout: '' }, { stdout: '[]' }, { stdout: '', stderr: 'bind 不上', exitCode: 1 }],
    });

    await expect(
      built.tool(DIY_RECORD_PREPARE_TOOL).execute({ unit: 'demo', url: URL2, doing: '发布' }, rig.diyExec()),
    ).rejects.toThrow('开不了录制窗');
    expect(built.record.live(Date.now())).toBeNull();
  });

  it('★★ 浮条没装上（那一页还在加载 / 回了非 JSON）：抛，且不留状态', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [
        { stdout: '' },
        { stdout: '[]' },
        { stdout: JSON.stringify({ page: 'p1', url: URL2 }) },
        { stdout: '{}' },
        { stdout: JSON.stringify({ href: URL2 }) },
        { stdout: 'not json at all' },
      ],
    });

    await expect(
      built.tool(DIY_RECORD_PREPARE_TOOL).execute({ unit: 'demo', url: URL2, doing: '发布' }, rig.diyExec()),
    ).rejects.toThrow('浮条没装上');
    expect(built.record.live(Date.now())).toBeNull();
  });

  it('★ 捕获那条没起来：照样能录（页面钩子还在），但话里说清这次只有页面钩子', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [
        { stdout: '' },
        { stdout: '[]' },
        { stdout: JSON.stringify({ page: 'p1', url: URL2 }) },
        { stdout: '{}' },
        { stdout: JSON.stringify({ href: URL2 }) },
        { stdout: ARM_OK() },
        { stdout: '', exitCode: 1 },
      ],
    });

    const out = (await built.tool(DIY_RECORD_PREPARE_TOOL).execute(
      { unit: 'demo', url: URL2, doing: '发布' },
      rig.diyExec(),
    )) as { capture: boolean; text: string };

    expect(out.capture).toBe(false);
    expect(out.text).toContain('只有页面钩子');
    expect(built.record.live(Date.now())?.phase).toBe('armed');
  });

  it('★★ read 分档：还没按 / 还在录（并把状态推成 recording），两档都不假装有请求', async () => {
    const armed = heldStore(null);
    const first = rig.harness({
      withTools: true,
      pact: false,
      record: armed,
      probe: [{ stdout: ARM_OK() }, { stdout: JSON.stringify({ ok: true, phase: 'armed', t0: null, t1: null, calls: [] }) }, { stdout: '0\n' }],
    });

    const early = (await first.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as { text: string; phase: string };
    expect(early.text).toContain('还没按');
    expect(early.phase).toBe('armed');

    const recording = heldStore(null);
    const second = rig.harness({
      withTools: true,
      pact: false,
      record: recording,
      probe: [
        { stdout: ARM_OK({ phase: 'recording' }) },
        { stdout: JSON.stringify({ ok: true, phase: 'recording', t0: 7, t1: null, calls: [POST()] }) },
        { stdout: 'oops not a number\n' },
      ],
    });

    const mid = (await second.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as {
      text: string;
      phase: string;
      captureLines: number;
    };
    expect(mid.text).toContain('还在录');
    expect(mid.phase).toBe('recording');
    expect(mid.captureLines).toBe(0);
    expect(recording.live(Date.now())?.t0).toBe(7);
  });

  it('★★ read 的诚实字段：导航过 + 钩子 0 条但捕获这一段有 ⇒ 候选来自捕获、noBody / nav 都报', async () => {
    const record = heldStore(null);
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
            t0: 1,
            t1: 2,
            href: URL2,
            here: `${URL2}/other`,
            dropped: 0,
            calls: [],
          }),
        },
        { stdout: '2\n' },
        { stdout: [line('POST', `${URL2}/api/publish`, 1), line('GET', `${URL2}/api/list`, 2)].join('\n') },
      ],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as {
      noBody: boolean;
      nav: boolean;
      hookCaught: number;
      capturedInSegment: number;
      rows: readonly RecordListRow[];
      text: string;
    };

    expect(out.hookCaught).toBe(0);
    expect(out.capturedInSegment).toBe(2);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0]?.source).toBe('capture');
    expect(out.noBody).toBe(true);
    expect(out.nav).toBe(true);
    expect(out.text).toContain('（捕获 · 入参 无');
    expect(out.text).toContain('导航过');
  });

  it('★★ stop 收标签兜底：列表里没有可用的就退到 close；连它都没成 ⇒ 话里直说"他自己关一下"', async () => {
    const record = heldStore(null);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: ARM_OK({ phase: 'finished' }) },
        { stdout: JSON.stringify({ ok: true, unhooked: 1, phase: 'finished', t0: 1, t1: 2, calls: [POST()] }) },
        { stdout: '' },
        { stdout: '' },
        { stdout: '' },
        { stdout: '' },
        { stdout: 'not a json array' },
        { stdout: '', exitCode: 1 },
      ],
    });

    const out = (await built.tool(DIY_RECORD_STOP_TOOL).execute({}, rig.diyExec())) as {
      cleaned: { readonly tab: boolean; readonly capture: boolean };
      text: string;
    };

    expect(out.cleaned.capture).toBe(true);
    expect(out.cleaned.tab).toBe(false);
    expect(out.text).toContain('那个标签没关掉');
    expect(built.commands.some((one) => one.includes("'close'"))).toBe(true);
  });

  it('★★ 释放那一拍自己炸了也不许把状态留在地上：releaseQuietly 吞掉，如实回"都没成"', async () => {
    const broken = {
      resolve: (spec: unknown) => spec,
      execute: () => Promise.reject(new Error('shell 没了')),
    } as unknown as DshShell;

    await expect(
      releaseQuietly({
        shell: broken,
        command: 'opencli',
        session: BROWSER_RECORD_SESSION,
        url: 'https://inventory.example.com/env',
        captureFile: '/w/workbench/diy/shots/rec-demo.jsonl',
      }),
    ).resolves.toEqual({ tab: false, capture: false });
  });

  it('★★ 不许跨域录：模块自己那份 design.json 说清了读源，就按它的域拒（拒的时候一条命令都不发）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: '{}' }] });
    const dir = join(rig.PACKAGES(), 'module-demo');
    const design = { datasource: { read: 'https://inventory.example.com/api/env/list' } };
    writeFileSync(join(dir, 'design.json'), JSON.stringify(design));

    expect(foreignDomainText(design, 'https://evil.example.com/env')).toContain('不是一个域');
    expect(foreignDomainText(design, 'https://inventory.example.com/env')).toBe('');

    await expect(
      built.tool(DIY_RECORD_PREPARE_TOOL).execute(
        { unit: 'demo', url: 'https://evil.example.com/env', doing: '发布' },
        rig.diyExec(),
      ),
    ).rejects.toThrow('不是一个域');
    expect(built.commands).toHaveLength(0);
    expect(built.record.live(Date.now())).toBeNull();
  });

  it('★★ 没说过读源的模块（还没有 design.json）不拒：交给审批屏上的那一行给他看', () => {
    expect(foreignDomainText(undefined, 'https://anywhere.example.com/x')).toBe('');
    expect(domainOf('https://www.Inventory.example.com/a/b')).toBe('inventory.example.com');
    expect(domainOf('不是 url')).toBe('');
    expect(readDomainsOf({ reads: [{ read: 'curl https://a.example.com/x' }, { read: 'https://b.example.com/y' }] })).toEqual([
      'a.example.com',
      'b.example.com',
    ]);
    expect(readDomainsOf({})).toEqual([]);
  });

  it('★★ read 带 waitMs：等到他按「结束」就回（不等满预算）', async () => {
    const record = heldStore(null);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: ARM_OK({ phase: 'recording' }) },
        { stdout: JSON.stringify({ ok: true, phase: 'recording', t0: 3, t1: null, calls: [POST()] }) },
        { stdout: JSON.stringify({ ok: true, phase: 'finished', t0: 3, t1: 9, calls: [POST()] }) },
        { stdout: '4\n' },
      ],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({ waitMs: 400 }, rig.diyExec())) as {
      phase: string;
      timedOut: boolean;
      waitedMs: number;
      rows: readonly unknown[];
    };

    expect(out.phase).toBe('finished');
    expect(out.timedOut).toBe(false);
    expect(out.rows).toHaveLength(1);
    expect(out.waitedMs).toBeGreaterThan(0);
  });

  it('★★ read 等不到就如实回「还在录」+ 挂一条 notice（下一拍叫他）', async () => {
    const record = heldStore(null);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: ARM_OK({ phase: 'recording' }) },
        { stdout: JSON.stringify({ ok: true, phase: 'recording', t0: 3, t1: null, calls: [] }) },
        { stdout: '0\n' },
      ],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({ waitMs: 150 }, rig.diyExec())) as {
      phase: string;
      timedOut: boolean;
      text: string;
    };

    expect(out.phase).toBe('recording');
    expect(out.timedOut).toBe(true);
    expect(out.text).toContain('还在录');
    expect(record.live(Date.now())?.phase).toBe('recording');
    const queued = takeHeldNotices('s1');
    expect(queued).toHaveLength(1);
    expect(queued[0]?.content[0]?.text).toContain('还没结束');
    expect(queued[0]?.source.kind).toBe('workbench-diy');
  });

  it('★★ 一场就一个周期：他按完结束之后再按「开始」不算数 —— read 不会把状态推回 recording', async () => {
    const record = heldStore(null);
    record.started('s1', Date.now(), Date.now());
    record.finished('s1', Date.now(), Date.now());
    expect(record.live(Date.now())?.phase).toBe('finished');

    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: ARM_OK({ phase: 'recording' }) },
        { stdout: JSON.stringify({ ok: true, phase: 'recording', t0: 4242, t1: null, calls: [POST()] }) },
        { stdout: '0\n' },
      ],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as { phase: string };
    const live = record.live(Date.now());

    expect(out.phase).toBe('finished');
    expect(live?.phase).toBe('finished');
    expect(live?.t1).not.toBeNull();
  });

  it('★ 浮条那一半也收起：只有 `armed` 能按「开始」（finished 之后按不动）', () => {
    expect(RECORD_ARM_SCRIPT).toContain("start.disabled = phase !== 'armed'");
    expect(RECORD_ARM_SCRIPT).not.toContain("phase !== 'armed' && phase !== 'finished'");
    expect(RECORD_ARM_SCRIPT).toContain('state.calls = [];');
  });

  it('★★ 他按了「结束录制」⇒ 宿主自己看出来并叫醒 agent（不用他再说一句"好了"）', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: JSON.stringify({ ok: true, phase: 'recording', t0: at, t1: null, calls: [POST()] }) },
        { stdout: JSON.stringify({ ok: true, phase: 'finished', t0: at, t1: at + 1000, calls: [POST(), GET()] }) },
      ],
    });
    const shell = built.ctx.get('shell') as unknown as DshShell;
    const ctx = built.ctx as unknown as DshHostContext;

    const waiting = await watchFinishStepOf({
      ctx,
      shell,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL2,
      captureFile: '/w/shots/rec-demo.jsonl',
    });
    const done = await watchFinishStepOf({
      ctx,
      shell,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL2,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(waiting.stop).toBe(false);
    expect(done.delivered).toBe(true);
    expect(done.stop).toBe(true);
    expect(record.live(Date.now())?.phase).toBe('finished');
    expect(record.live(Date.now())?.t1).toBe(at + 1000);
    const queued = takeHeldNotices('s1');
    expect(queued).toHaveLength(1);
    expect(queued[0]?.content[0]?.text).toContain('结束录制');
    expect(queued[0]?.source.kind).toBe('workbench-diy');
    expect(queued[0]?.source.form).toBe('notice');
    expect(queued[0]?.role).toBe('user');
  });

  it('★★ 台账过期（TTL 到点，没人来收）⇒ 看门那一拍把循环与标签一起收掉，不留孤儿进程', async () => {
    const record = heldStore(null);
    const old = Date.now() - RECORD_STALE_MS - 1000;
    record.started('s1', old, old);
    const built = rig.harness({ withTools: true, pact: false, record, probe: [] });
    const shell = built.ctx.get('shell') as unknown as DshShell;
    const ctx = built.ctx as unknown as DshHostContext;

    const step = await watchFinishStepOf({
      ctx,
      shell,
      command: '',
      sessionId: 's1',
      store: record,
      url: URL2,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(record.live(Date.now())).toBeNull();
    expect(step.stop).toBe(true);
    expect(step.delivered).toBe(false);
    expect(built.commands.some((one) => one.includes('pkill -P'))).toBe(true);
    expect(built.commands.some((one) => one.includes("'tab' 'list'"))).toBe(true);
  });

  it('★ 换了一场（台账里那条不是我的）⇒ 看门自己退场，不许去动别人的循环', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({ withTools: true, pact: false, record, probe: [] });
    const shell = built.ctx.get('shell') as unknown as DshShell;
    const ctx = built.ctx as unknown as DshHostContext;

    const step = await watchFinishStepOf({
      ctx,
      shell,
      command: '',
      sessionId: 's9',
      store: record,
      url: URL2,
      captureFile: '/w/shots/rec-demo.jsonl',
    });

    expect(step.stop).toBe(true);
    expect(built.commands).toHaveLength(0);
    expect(record.live(Date.now())?.sessionId).toBe('s1');
  });

});
