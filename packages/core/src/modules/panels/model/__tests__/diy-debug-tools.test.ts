import { describe, expect, it } from 'vitest';
import type { DebugRefusal } from '@dsh-workbench/shared/host';
import { createDiyRig } from '../../__tests__/diy-harness';
import { debugRefusalText, renderDebugStop } from '../diy-debug-tools';
import {
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_DEBUG_STOP_TOOL,
  DIY_CLICK_TOOL,
  DIY_KEYS_TOOL,
} from '../../unit';

const REFUSALS: readonly DebugRefusal[] = [
  'already-held',
  'held-by-other',
  'not-owner',
  'none',
  'already-paused',
  'already-debugging',
];

const settled = async (): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

describe('调试约定：说出口的四把动词', () => {
  const rig = createDiyRig();
  const page = (board: string): string =>
    JSON.stringify({
      plugin: '@dsh-workbench/core',
      pid: 1,
      url: 'http://127.0.0.1:3081/',
      title: 't',
      board,
      open: true,
      shown: true,
    });
  const HERE = (): string => page(rig.WORKSHOP());
  const ELSEWHERE = page('/w/project');
  const KEYS = JSON.stringify({ pressed: true });

  it('★★ 开始调试：记下目标与会话，报出 phase；同一个会话再来一次当场拒', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: HERE() }, { stdout: HERE() }] });

    const started = (await built.tool(DIY_DEBUG_START_TOOL).execute(
      { unit: 'demo' },
      rig.diyExec(),
    )) as { phase: string; text: string };

    expect(started.phase).toBe('debugging');
    expect(started.text).toContain('开始调试 demo');
    expect(built.debug.live(Date.now())?.sessionId).toBe('s1');

    await expect(
      built.tool(DIY_DEBUG_START_TOOL).execute({ unit: 'demo' }, rig.diyExec()),
    ).rejects.toThrow('已经持有一场调试');
  });

  it('★★ 另一场调试占着那块屏 ⇒ 别人的会话来开就被拒（一次只允许一场）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: HERE() }] });
    await built.tool(DIY_DEBUG_START_TOOL).execute({ unit: 'demo' }, rig.diyExec());

    await expect(
      built.tool(DIY_DEBUG_START_TOOL).execute({ unit: 'demo' }, rig.diyExec('s2')),
    ).rejects.toThrow('另一场调试还占着那块屏');
  });

  it('★★ 暂停之后动作族关闸（不再拿屏当目标）；继续之后才放行', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [{ stdout: HERE() }, { stdout: HERE() }, { stdout: HERE() }, { stdout: HERE() }, { stdout: KEYS }],
    });
    await built.tool(DIY_DEBUG_START_TOOL).execute({ unit: 'demo' }, rig.diyExec());
    await built.tool(DIY_DEBUG_PAUSE_TOOL).execute({}, rig.diyExec());

    expect(built.debug.live(Date.now())?.phase).toBe('paused');
    await expect(
      built.tool(DIY_KEYS_TOOL).execute({ key: 'Escape' }, rig.diyExec()),
    ).rejects.toThrow('调试已暂停');

    await built.tool(DIY_DEBUG_RESUME_TOOL).execute({}, rig.diyExec());
    const passed = (await built.tool(DIY_KEYS_TOOL).execute({ key: 'Escape' }, rig.diyExec())) as {
      ok: boolean;
      verb: string;
    };

    expect(passed.ok).toBe(true);
    expect(passed.verb).toBe('keys');
  });

  it('★★ 屏漂走：闸只拒、只说实情，**不动状态**（落不落 paused 是 agent 的决定）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: HERE() }, { stdout: ELSEWHERE }] });
    await built.tool(DIY_DEBUG_START_TOOL).execute({ unit: 'demo' }, rig.diyExec());

    const failure = built.tool(DIY_CLICK_TOOL).execute({ unit: 'demo' }, rig.diyExec());
    await expect(failure).rejects.toThrow('发不出去');
    await expect(built.tool(DIY_CLICK_TOOL).execute({ unit: 'demo' }, rig.diyExec())).rejects.toThrow('仍然**进行中**');
    await expect(built.tool(DIY_CLICK_TOOL).execute({ unit: 'demo' }, rig.diyExec())).rejects.toThrow(
      'workbench_diy_debug_pause',
    );

    expect(built.debug.live(Date.now())?.phase).toBe('debugging');
  });

  it('★★ 别的会话在占屏：你这个会话的看/动也一并关闸（不跟它抢）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: HERE() }, { stdout: HERE() }] });
    await built.tool(DIY_DEBUG_START_TOOL).execute({ unit: 'demo' }, rig.diyExec('s1'));

    await expect(built.tool(DIY_CLICK_TOOL).execute({ unit: 'demo' }, rig.diyExec('s2'))).rejects.toThrow(
      '另一场调试正占着那块屏',
    );
  });

  it('★ 收工清掉占用；没有调试态时再说一句"不用收工"，且别人不许替你收工', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: HERE() }] });
    await built.tool(DIY_DEBUG_START_TOOL).execute({ unit: 'demo' }, rig.diyExec());

    await expect(built.tool(DIY_DEBUG_STOP_TOOL).execute({}, rig.diyExec('s2'))).rejects.toThrow('不是你这个会话的');
    const stopped = (await built.tool(DIY_DEBUG_STOP_TOOL).execute({}, rig.diyExec())) as { text: string };

    expect(stopped.text).toContain('收工了');
    expect(built.debug.live(Date.now())).toBeNull();
    await expect(built.tool(DIY_DEBUG_STOP_TOOL).execute({}, rig.diyExec())).rejects.toThrow('现在没有调试态');
  });

  it('★★ 收工那一拍把网络捕获与日志钩子一起收了（不用再回头调 net_stop / logs_stop）', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [{ stdout: HERE() }, { stdout: JSON.stringify({ unhooked: 3, dropped: 0 }) }],
    });
    await built.tool(DIY_DEBUG_START_TOOL).execute({ unit: 'demo' }, rig.diyExec());

    const stopped = (await built.tool(DIY_DEBUG_STOP_TOOL).execute({}, rig.diyExec())) as { text: string };
    await settled();

    expect(stopped.text).toContain('顺手把这一场的观察收一收');
    expect(built.commands.some((one) => one.includes('net-workbench.jsonl.pid'))).toBe(true);
    expect(built.commands.some((one) => one.includes("'eval'") && one.includes('unhooked'))).toBe(true);
  });

  it('★ 没开始就暂停 ⇒ 一句人话（不是崩）', async () => {
    const built = rig.harness({ withTools: true, pact: false });

    await expect(built.tool(DIY_DEBUG_PAUSE_TOOL).execute({}, rig.diyExec())).rejects.toThrow('现在没有调试态');
  });

  it('★★ 收工之后约定就没了：看 / 动又被拒（约定是这一族唯一的入口）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: HERE() }, { stdout: HERE() }] });

    await built.tool(DIY_DEBUG_START_TOOL).execute({ unit: 'demo' }, rig.diyExec());
    await built.tool(DIY_DEBUG_STOP_TOOL).execute({}, rig.diyExec());

    await expect(built.tool(DIY_CLICK_TOOL).execute({ unit: 'demo' }, rig.diyExec())).rejects.toThrow('没有调试约定');
    await expect(built.tool(DIY_KEYS_TOOL).execute({ key: 'Escape' }, rig.diyExec())).rejects.toThrow(
      'workbench_diy_debug_start',
    );
  });
});

describe('调试态的每一句拒绝都要能照做', () => {
  it('★★ 六种拒绝各有自己的话，且都点出下一步（不是"出错了"）', () => {
    const text = REFUSALS.map((code) => debugRefusalText(code));

    expect(new Set(text).size).toBe(REFUSALS.length);
    for (const one of text) expect(one).not.toContain('undefined');
    expect(debugRefusalText('none')).toContain('没有调试态');
    expect(debugRefusalText('held-by-other')).toContain('只允许一场');
    expect(debugRefusalText('already-held')).toContain('workbench_diy_debug_stop');
    expect(debugRefusalText('not-owner')).toContain('谁开始');
    expect(debugRefusalText('already-paused')).toContain('workbench_diy_debug_resume');
    expect(debugRefusalText('already-debugging')).toContain('正在调试中');
  });

  it('★ 收工那句话点名是哪一个模块（别只说"好了"）', () => {
    const state = {
      phase: 'debugging' as const,
      sessionId: 's1',
      workspacePath: '/w/diy',
      title: '演示工作区',
      board: '/w/diy',
      unit: 'demo',
      name: 'demo',
      startedAt: 1,
      at: 2,
    };

    expect(renderDebugStop(state)).toContain('demo');
  });
});
