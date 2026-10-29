import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import { createDiyRig } from '../../__tests__/diy-harness';
import { URL, heldStore } from '../../__tests__/record-fixtures';
import { releaseRecord, shotFileOf, watchFinishStepOf } from '../diy-record';

const recording = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ ok: true, phase: 'recording', t0: 1, t1: null, shots: 0, shotsAt: null, calls: [], ...extra });

describe('录制交接：他按一下「截图」，宿主按计数落图', () => {
  const rig = createDiyRig();

  beforeEach(() => {
    rig.scaffold('demo');
  });

  const captureFile = '/w/shots/rec-demo.jsonl';

  const stepOf = async (
    built: ReturnType<ReturnType<typeof createDiyRig>['harness']>,
    record: ReturnType<typeof heldStore>,
    sessionId = 's1',
  ) =>
    watchFinishStepOf({
      ctx: built.ctx as unknown as DshHostContext,
      shell: built.ctx.get('shell') as unknown as DshShell,
      command: '',
      sessionId,
      store: record,
      url: URL,
      captureFile,
    });

  it('★ 路径是这一族自己的名字：与 rec-<unit>.jsonl 同目录、rec-shot- 前缀（不改工坊那一页那份）', () => {
    expect(shotFileOf('/w/shots/rec-demo.jsonl', 'demo', 2)).toBe('/w/shots/rec-shot-demo-2.png');
    expect(shotFileOf('/w/shots/rec-demo.jsonl', 'demo', 1)).not.toContain('/shots/demo-');
    expect(shotFileOf('/w/shots/rec-demo.jsonl', 'demo', 1)).toBe(
      `${dirname('/w/shots/rec-demo.jsonl')}/rec-shot-demo-1.png`,
    );
  });

  it('★★ 计数涨了 ⇒ argv 恰好是 `screenshot <path>`（视口截图：不许 --full-page，也不许 --width/--height），台账记下它', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: recording({ shots: 1, shotsAt: at }) },
        { stdout: '{"path":"/w/shots/rec-shot-demo-1.png"}' },
      ],
    });

    const step = await stepOf(built, record);

    expect(step.stop).toBe(false);
    const shot = built.commands.find((one) => one.includes("'screenshot'"));
    expect(shot).toBeDefined();
    expect(shot).toContain("'screenshot' '/w/shots/rec-shot-demo-1.png'");
    expect(shot).not.toContain('--full-page');
    expect(shot).not.toContain('--width');
    expect(shot).not.toContain('--height');
    expect(shot).toContain(BROWSER_RECORD_SESSION);
    expect(shot).not.toContain('demo-999');

    const live = record.live(Date.now());
    expect(live?.shots).toEqual([{ n: 1, at: expect.any(Number), path: '/w/shots/rec-shot-demo-1.png' }]);
    expect(live?.shotsSeen).toBe(1);
  });

  it('★★ 计数没涨 ⇒ 一条命令都不发（只 eval 那一拍，不许空拍）', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [{ stdout: recording() }],
    });

    await stepOf(built, record);

    expect(built.commands).toHaveLength(1);
    expect(built.commands.some((one) => one.includes("'screenshot'"))).toBe(false);
    expect(record.live(Date.now())?.shots).toEqual([]);
    expect(record.live(Date.now())?.shotsSeen).toBe(0);
  });

  it('★★ 同一张已经落过 ⇒ 也不再拍（计数得比台账里落成的那个高）', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    record.shotTaken('s1', { n: 1, at, path: '/w/shots/rec-shot-demo-1.png' }, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [{ stdout: recording({ shots: 1 }) }],
    });

    await stepOf(built, record);

    expect(built.commands.some((one) => one.includes("'screenshot'"))).toBe(false);
    expect(record.live(Date.now())?.shots).toHaveLength(1);
  });

  it('★★ opencli 报错 ⇒ 台账带原文、shotsSeen 不前进、下一拍重试一次、仍失败就停', async () => {
    const record = heldStore(null);
    const at = Date.now();
    record.started('s1', at, at);
    const built = rig.harness({
      withTools: true,
      pact: false,
      record,
      probe: [
        { stdout: recording({ shots: 1 }) },
        { exitCode: 1, stderr: 'opencli：这一页截不下来' },
        { stdout: recording({ shots: 1 }) },
        { exitCode: 1, stderr: 'opencli：还是截不下来' },
        { stdout: recording({ shots: 1 }) },
      ],
    });

    await stepOf(built, record);
    const first = record.live(Date.now());
    expect(first?.shotsSeen).toBe(0);
    expect(first?.shots).toEqual([
      { n: 1, at: expect.any(Number), path: '/w/shots/rec-shot-demo-1.png', error: 'opencli：这一页截不下来' },
    ]);

    await stepOf(built, record);
    const second = record.live(Date.now());
    expect(second?.shotsSeen).toBe(0);
    expect(second?.shots).toEqual([
      { n: 1, at: expect.any(Number), path: '/w/shots/rec-shot-demo-1.png', error: 'opencli：还是截不下来' },
    ]);

    await stepOf(built, record);
    expect(built.commands.filter((one) => one.includes("'screenshot'"))).toHaveLength(2);
    expect(record.live(Date.now())?.shots).toHaveLength(1);
  });

  it('★★ 收工（releaseRecord）不许删掉已经落下的 .png（跟 .last 一个待遇）', async () => {
    const file = `${rig.root()}/workbench/diy/shots/rec-demo.jsonl`;
    const png = `${rig.root()}/workbench/diy/shots/rec-shot-demo-1.png`;
    mkdirSync(dirname(png), { recursive: true });
    writeFileSync(png, 'png-bytes');

    const fake = rig.fakeShell([
      { stdout: '' },
      { stdout: JSON.stringify([{ page: 'p1', url: URL }]) },
      { stdout: '{"closed":"p1"}' },
    ]);
    const cleaned = await releaseRecord({
      shell: fake.shell,
      command: '',
      session: BROWSER_RECORD_SESSION,
      url: URL,
      captureFile: file,
    });

    expect(cleaned.capture).toBe(true);
    expect(cleaned.tab).toBe(true);
    expect(existsSync(png)).toBe(true);
  });
});
