import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDiyRig } from '../../__tests__/diy-harness';
import { ARM_OK, GET, POST, URL, entry, envelope, heldStore, line } from '../../__tests__/record-fixtures';
import type { RecordListRow } from '../diy-record-text';
import { DIY_RECORD_DETAIL_TOOL, DIY_RECORD_PREPARE_TOOL, DIY_RECORD_READ_TOOL, DIY_RECORD_STOP_TOOL } from '../../unit';

describe('录制交接：prepare / read / stop 三把', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
  });

  it('★★ prepare：开窗（这一拍前台）+ 等站稳 + 装浮条 + 臂上捕获，状态进 armed', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [
        { stdout: '' },
        { stdout: '[]' },
        { stdout: JSON.stringify({ page: 'p1', url: URL }) },
        { stdout: '{}' },
        { stdout: JSON.stringify({ href: URL }) },
        { stdout: ARM_OK() },
        { stdout: '' },
      ],
    });

    const out = (await built.tool(DIY_RECORD_PREPARE_TOOL).execute(
      { unit: 'demo', url: URL, doing: '发布' },
      rig.diyExec(),
    )) as { ok: boolean; wrote: boolean; phase: string; talk: string; capture: boolean; captureFile: string };

    expect(out.ok).toBe(true);
    expect(out.wrote).toBe(false);
    expect(out.phase).toBe('armed');
    expect(out.capture).toBe(true);
    expect(out.talk).toBe('已开始录制');
    expect(out.captureFile).toContain(join(rig.root(), 'workbench', 'artifacts', ''));
    expect(out.captureFile.endsWith(join('rec-demo.jsonl'))).toBe(true);

    expect(built.record.live(Date.now())?.phase).toBe('armed');
    expect(built.record.live(Date.now())?.unit).toBe('demo');
    expect(built.commands.some((one) => one.includes("'--window' 'foreground'"))).toBe(true);
    expect(built.commands.some((one) => one.includes('location.href'))).toBe(true);
    expect(built.commands.some((one) => one.includes("'network' '--follow'") && one.includes('sleep 2'))).toBe(true);
    expect(
      built.commands.some(
        (one) => one.includes("'network' '--all' '--raw'") && one.includes('node -e') && one.includes('.pid'),
      ),
    ).toBe(true);
    expect(built.commands.some((one) => one.includes('while kill -0'))).toBe(true);
    expect(built.commands.some((one) => one.includes('pkill -P'))).toBe(true);
  });

  it('★★ 另一场占着就不许开（拒的话里有是谁占着）', async () => {
    const held = heldStore(null);
    const built = rig.harness({ withTools: true, pact: false, record: held, probe: [] });

    await expect(
      built.tool(DIY_RECORD_PREPARE_TOOL).execute({ unit: 'demo', url: URL, doing: '发布' }, rig.diyExec('s9')),
    ).rejects.toThrow('另一场录制还占着');
  });

  it('★ 没给 url 当场拒（不猜是哪个站点）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [] });

    await expect(
      built.tool(DIY_RECORD_PREPARE_TOOL).execute({ unit: 'demo', doing: '发布' }, rig.diyExec()),
    ).rejects.toThrow('要那一页的 url');
  });

  it('★★ read：页面说录完了就把状态推到 finished，只回要的那几条（还带诚实字段）', async () => {
    const record = heldStore({ method: 'POST', urlContains: '/api/publish' });
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
            dropped: 1,
            calls: [POST(), GET()],
          }),
        },
        { stdout: '4\n' },
        {
          stdout: [
            line('POST', `${URL}/api/publish`, 15),
            line('POST', `${URL}/api/other`, 16),
            line('GET', `${URL}/api/list`, 17),
            line('POST', `${URL}/api/publish`, 100000),
          ].join('\n'),
        },
      ],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as {
      phase: string;
      rows: readonly RecordListRow[];
      captureLines: number;
      capturedInSegment: number;
      capturedOutside: number;
      hookCaught: number;
      dropped: number;
      noBody: boolean;
      nav: boolean;
    };

    expect(out.phase).toBe('finished');
    expect(out.rows).toHaveLength(3);
    expect(out.rows.map((one) => one.method)).toContain('GET');
    expect(out.rows.find((one) => one.url.endsWith('/api/publish'))?.marked).toBe(true);
    expect(out.rows.find((one) => one.url.endsWith('/api/other'))).toBeDefined();
    expect(out.captureLines).toBe(4);
    expect(out.capturedInSegment).toBe(3);
    expect(out.capturedOutside).toBe(1);
    expect(out.hookCaught).toBe(2);
    expect(out.dropped).toBe(1);
    expect(out.noBody).toBe(false);
    expect(out.nav).toBe(false);
    expect(record.live(Date.now())?.t1).toBe(20);
  });

  it('★ read：那一页上没钩子时如实说（不假装"没有请求"）', async () => {
    const record = heldStore(null);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [{ stdout: ARM_OK({ phase: 'finished' }) }, { stdout: JSON.stringify({ ok: false, code: 'not-armed', phase: 'none', calls: [] }) }, { stdout: '0\n' }],
    });

    const out = (await built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())) as { text: string; ok: boolean };
    expect(out.ok).toBe(false);
    expect(out.text).toContain('还没有录制条');
  });

  it('★ read：没有那一场时当场说清（先 prepare）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [] });
    await expect(built.tool(DIY_RECORD_READ_TOOL).execute({}, rig.diyExec())).rejects.toThrow(DIY_RECORD_PREPARE_TOOL);
  });

  it('★★ stop：收标签 + 停捕获 + 清状态，回一段能直接落 design.json 的原文', async () => {
    const record = heldStore({ method: 'POST', urlContains: '/api/publish' });
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: ARM_OK({ phase: 'finished' }) },
        {
          stdout: JSON.stringify({
            ok: true,
            unhooked: 1,
            phase: 'finished',
            t0: 10,
            t1: 20,
            dropped: 0,
            calls: [POST()],
          }),
        },
        { stdout: '2\n' },
        { stdout: [line('POST', `${URL}/api/publish`, 15), line('PUT', `${URL}/api/other`, 16)].join('\n') },
        { stdout: 'ok\n' },
        { stdout: '' },
        { stdout: '' },
        { stdout: JSON.stringify([{ page: 'p1', url: URL, title: '环境' }]) },
        { stdout: '{"closed":"p1"}' },
      ],
    });

    const out = (await built.tool(DIY_RECORD_STOP_TOOL).execute({}, rig.diyExec())) as {
      probeCommand: string;
      rows: readonly RecordListRow[];
      lastFile: string;
      capturedInSegment: number;
      hookCaught: number;
      cleaned: { readonly tab: boolean; readonly capture: boolean };
      text: string;
    };

    expect(out.probeCommand.startsWith('POST https://inventory.example.com/env/api/publish')).toBe(true);
    expect(out.rows).toHaveLength(2);
    expect(out.hookCaught).toBe(1);
    expect(out.capturedInSegment).toBe(2);
    expect(out.lastFile.endsWith('rec-demo.jsonl.last')).toBe(true);
    expect(out.cleaned).toEqual({ tab: true, capture: true, hook: true });
    expect(out.text).toContain('原文留在');
    expect(out.text).toContain('不许复现');
    expect(out.text).toContain('这段原文可以直接落');
    expect(record.live(Date.now())).toBeNull();
    expect(built.commands.some((one) => one.includes('tab') && one.includes('close'))).toBe(true);
  });
});
describe('录制交接：detail 那一拍（清单 → 挑一条 → 原文）', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
  });

  it('★★ 按 key 从快照原文里取回入参 / 出参，且只发一条 grep（不整读文件）', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      record: heldStore(null),
      probe: [
        {
          stdout: envelope([
            entry('POST', `${URL}/api/publish`, 5, {
              request: { headers: { 'content-type': 'application/json' }, body: { env: 'test' }, body_full_size: 14 },
              body: { ok: true },
              body_full_size: 11,
            }),
          ]),
        },
      ],
    });

    const out = (await built.tool(DIY_RECORD_DETAIL_TOOL).execute(
      { key: `POST ${URL}/api/publish` },
      rig.diyExec(),
    )) as { found: boolean; request: string; response: string; requestFullSize: number; text: string };

    expect(out.found).toBe(true);
    expect(out.request).toBe('{"env":"test"}');
    expect(out.response).toBe('{"ok":true}');
    expect(out.requestFullSize).toBe(14);
    expect(out.text).toContain('入参（request body，原长 14 字节）');
    expect(out.text).toContain('出参（response body');
    expect(out.text).toContain('请求头（可能含凭据');
    expect(built.commands.some((one) => one.includes('grep') && one.includes('-m 20'))).toBe(true);
  });

  it('★★ 按 index 走清单：key 为空的那条（只在页面钩子那份里）就回钩子的原文', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      record: heldStore(null),
      probe: [
        { stdout: JSON.stringify({ ok: true, phase: 'finished', t0: 1, t1: 2, calls: [POST(), GET()] }) },
        { stdout: '0\n' },
        { stdout: '' },
      ],
    });

    const out = (await built.tool(DIY_RECORD_DETAIL_TOOL).execute({ index: 0 }, rig.diyExec())) as {
      found: boolean;
      request: string;
      text: string;
    };

    expect(out.found).toBe(true);
    expect(out.request).toBe('{"env":"test"}');
    expect(out.text).toContain('页面钩子（这一段）');
  });

  it('★★ 收工之后：给 unit 就去读 shots/rec-<unit>.last.jsonl', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [
        {
          stdout: envelope([entry('POST', `${URL}/api/publish`, 5, { request: { body: '{"env":"prod"}' } })]),
        },
      ],
    });

    const out = (await built.tool(DIY_RECORD_DETAIL_TOOL).execute(
      { unit: 'demo', key: `POST ${URL}/api/publish` },
      rig.diyExec(),
    )) as { found: boolean; request: string };

    expect(out.found).toBe(true);
    expect(out.request).toBe('{"env":"prod"}');
    expect(built.commands.some((one) => one.includes('rec-demo.jsonl.last'))).toBe(true);
  });

  it('★ 找不到那条：如实说"两边都没有"，并给兜底那几条路', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      record: heldStore(null),
      probe: [
        { stdout: '' },
        { stdout: JSON.stringify({ ok: true, phase: 'finished', t0: 1, t1: 2, calls: [] }) },
      ],
    });

    const out = (await built.tool(DIY_RECORD_DETAIL_TOOL).execute(
      { key: 'POST nope' },
      rig.diyExec(),
    )) as { found: boolean; text: string };

    expect(out.found).toBe(false);
    expect(out.text).toContain('没找到这一条');
    expect(out.text).toContain('复制成 curl');
  });

  it('★★ 给 key 且原文里有 ⇒ 一条 eval 都不发（收工后不许把空白标签招回来）', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [
        {
          stdout: envelope([entry('POST', `${URL}/api/publish`, 5, { request: { body: '{"env":"prod"}' } })]),
        },
      ],
    });

    const out = (await built.tool(DIY_RECORD_DETAIL_TOOL).execute(
      { unit: 'demo', key: `POST ${URL}/api/publish` },
      rig.diyExec(),
    )) as { found: boolean };

    expect(out.found).toBe(true);
    expect(built.commands.some((one) => one.includes('eval'))).toBe(false);
    expect(built.commands.some((one) => one.includes('browser'))).toBe(false);
  });

  it('★ 台账已是 finished（窗已收）⇒ 那条找不到也不碰页，如实说钩子那份问不到了', async () => {
    const record = heldStore(null);
    const now = Date.now();
    record.started('s1', now, now);
    record.finished('s1', now, now);
    const built = rig.harness({ withTools: true, pact: false, record, probe: [{ stdout: '' }] });

    const out = (await built.tool(DIY_RECORD_DETAIL_TOOL).execute({ key: 'POST nope' }, rig.diyExec())) as {
      found: boolean;
      text: string;
    };

    expect(out.found).toBe(false);
    expect(out.text).toContain('钩子那一份问不到');
    expect(built.commands.some((one) => one.includes('eval'))).toBe(false);
  });

  it('★ 收工之后光给 key 没给 unit：当场说清要给 unit（不许瞎猜哪一场）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [] });

    await expect(built.tool(DIY_RECORD_DETAIL_TOOL).execute({ key: 'POST x' }, rig.diyExec())).rejects.toThrow(
      '这一场录制已经不在了',
    );
  });
});
