import { describe, expect, it } from 'vitest';
import { createDiyRig } from '../__tests__/diy-harness';
import { LOGS_ARM_SCRIPT, LOGS_READ_SCRIPT, LOGS_STOP_SCRIPT, logsReadOf, renderLogs } from './diy-logs';
import { DIY_LOGS_READ_TOOL, DIY_LOGS_STOP_TOOL, DIY_LOGS_WATCH_TOOL } from '../unit';

const rig = createDiyRig();
const PAGE = JSON.stringify({ plugin: '@dsh-workbench/core', pid: 1, url: 'http://127.0.0.1:3081/', open: true, shown: true, title: 't' });

describe('听控制台：钩子必须有上限、能卸', () => {
  it('★ 环形缓冲 + 单条截断：不封顶就是慢慢吃掉用户那一页的内存', () => {
    expect(LOGS_ARM_SCRIPT).toContain('buf.splice(0, buf.length - CAP)');
    expect(LOGS_ARM_SCRIPT).toContain('slice(0, TEXT_MAX)');
    expect(LOGS_ARM_SCRIPT).toContain('const CAP = 200');
  });

  it('★ 装两次不会套两层（幂等），而且留着原来的那份用来还原', () => {
    expect(LOGS_ARM_SCRIPT).toContain('current.__dshDiy === true');
    expect(LOGS_ARM_SCRIPT).toContain('patched.__real');
  });

  it('★ 单条取字符串不会把页面搞崩：拿不到文本时退成 unprintable', () => {
    expect(LOGS_ARM_SCRIPT).toContain('JSON.stringify(value)');
    expect(LOGS_ARM_SCRIPT).toContain("'[unprintable]'");
  });

  it('卸钩子：把 console 还原回去、把缓冲扔掉', () => {
    expect(LOGS_STOP_SCRIPT).toContain('console[level] = current.__real');
    expect(LOGS_STOP_SCRIPT).toContain('delete window[KEY]');
  });
});

describe('读出来怎么说（没装钩子 ≠ 没有报错）', () => {
  it('没装：说清"还没装钩子"并指出下一步，不许说成"没有报错"', () => {
    expect(LOGS_READ_SCRIPT).toContain("'not-armed'");
    const text = renderLogs({ ok: false, code: 'not-armed', seen: 0, lines: [] });

    expect(text).toContain('还没有钩子');
    expect(text).toContain('workbench_diy_logs_watch');
    expect(text).not.toContain('没有报错');
  });

  it('装了但一条都没有：如实说"还没打过 console.*"', () => {
    expect(renderLogs({ ok: true, code: '', seen: 0, lines: [] })).toContain('一条 console.* 都没打过');
  });

  it('逐条列出来，并说清只列了最近多少条', () => {
    const lines = Array.from({ length: 60 }, (_, index) => ({
      level: index === 59 ? 'error' : 'log',
      text: `第 ${String(index)} 条`,
      at: 0,
    }));
    const text = renderLogs({ ok: true, code: '', seen: 60, lines });

    expect(text).toContain('最近 50 条');
    expect(text).toContain('攒了 60 条');
    expect(text).toContain('[error] 第 59 条');
    expect(text).not.toContain('第 9 条\n');
  });

  it('脏数据不当真：空的 / 不是对象的行都扔掉', () => {
    const read = logsReadOf({
      ok: true,
      seen: 4,
      lines: [{ level: 'warn', text: '[demo] 慢', at: 1 }, { level: 'log', text: '' }, 'x', null],
    });

    expect(read.lines).toEqual([{ level: 'warn', text: '[demo] 慢', at: 1 }]);
    expect(read.seen).toBe(4);
    expect(logsReadOf(undefined).ok).toBe(false);
  });
});

describe('★ 三把真的注册进工坊，而且是一动词一把（没有 action 多路复用）', () => {
  it('装 / 读 / 卸各一把，参数里只有 session', () => {
    const built = rig.harness({ withTools: true });
    const names = built.registered.map((one) => one.name);

    expect(names).toContain(DIY_LOGS_WATCH_TOOL);
    expect(names).toContain(DIY_LOGS_READ_TOOL);
    expect(names).toContain(DIY_LOGS_STOP_TOOL);
    for (const name of [DIY_LOGS_WATCH_TOOL, DIY_LOGS_READ_TOOL, DIY_LOGS_STOP_TOOL]) {
      const props = (built.tool(name).parameters?.['properties'] ?? {}) as Record<string, unknown>;
      expect(Object.keys(props), name).toEqual(['session']);
    }
  });

  it('装：发出去的是一条 eval，脚本里就是那个带上限的钩子', async () => {
    const built = rig.harness({
      withTools: true,
      probe: [{ stdout: PAGE }, { stdout: JSON.stringify({ ok: true, cap: 200, levels: 5, hooked: 5, size: 0 }) }],
    });

    const answer = (await built.tool(DIY_LOGS_WATCH_TOOL).execute({}, rig.diyExec())) as { text: string };

    expect(answer.text).toContain('听上了');
    expect(answer.text).toContain('workbench_diy_logs_read');
    expect(built.commands[1]).toContain("'eval'");
    expect(built.commands[1]).toContain('__dshDiyLogs');
  });

  it('装过再装：说"已经在听"，不套第二层', async () => {
    const built = rig.harness({
      withTools: true,
      probe: [{ stdout: PAGE }, { stdout: JSON.stringify({ ok: true, cap: 200, levels: 5, hooked: 0, size: 3 }) }],
    });

    const answer = (await built.tool(DIY_LOGS_WATCH_TOOL).execute({}, rig.diyExec())) as { text: string };

    expect(answer.text).toContain('已经在听了');
  });

  it('读：把页面里那几条列出来', async () => {
    const built = rig.harness({
      withTools: true,
      probe: [
        { stdout: PAGE },
        { stdout: JSON.stringify({ ok: true, seen: 1, lines: [{ level: 'error', text: 'boom', at: 1 }] }) },
      ],
    });

    const answer = (await built.tool(DIY_LOGS_READ_TOOL).execute({}, rig.diyExec())) as { text: string };

    expect(answer.text).toContain('[error] boom');
  });

  it('卸：说清卸了几个钩子、扔了几条', async () => {
    const built = rig.harness({
      withTools: true,
      probe: [{ stdout: PAGE }, { stdout: JSON.stringify({ ok: true, unhooked: 5, dropped: 12 }) }],
    });

    const answer = (await built.tool(DIY_LOGS_STOP_TOOL).execute({}, rig.diyExec())) as { text: string };

    expect(answer.text).toContain('卸掉 5 个钩子');
    expect(answer.text).toContain('扔掉 12 条');
  });

  it('opencli 回错信封时不当成功', async () => {
    const built = rig.harness({
      withTools: true,
      probe: [{ stdout: PAGE }, { stdout: JSON.stringify({ error: { message: 'eval 被拒' } }), exitCode: 1 }],
    });

    const answer = (await built.tool(DIY_LOGS_READ_TOOL).execute({}, rig.diyExec())) as { text: string };

    expect(answer.text).toContain('读不到');
    expect(answer.text).toContain('eval 被拒');
  });
});
