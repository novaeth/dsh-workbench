import { describe, expect, it } from 'vitest';
import { PAGE, createBrowserRig } from '../../__tests__/browser-tools-harness';
import {
  BROWSER_TOOLS,
  argvOf,
  cardSelectorIn,
  evalWrapped,
  type BrowserToolRow,
} from '../diy-browser-tools';
import {
  DIY_CLICK_TOOL,
  DIY_DIALOG_TOOL,
  DIY_EVAL_TOOL,
  DIY_FILL_TOOL,
  DIY_FIND_TOOL,
  DIY_HOVER_TOOL,
  DIY_HTML_TOOL,
  DIY_KEYS_TOOL,
  DIY_NETWORK_TOOL,
  DIY_SCREENSHOT_TOOL,
  DIY_SCROLL_TOOL,
  DIY_STATE_TOOL,
  DIY_TYPE_TOOL,
  DIY_WAIT_TOOL,
} from '../../unit';

const { browserRig, run } = createBrowserRig();

const BROWSER_TOOL_NAMES = [
  DIY_STATE_TOOL,
  DIY_HTML_TOOL,
  DIY_FIND_TOOL,
  DIY_CLICK_TOOL,
  DIY_HOVER_TOOL,
  DIY_TYPE_TOOL,
  DIY_FILL_TOOL,
  DIY_KEYS_TOOL,
  DIY_SCROLL_TOOL,
  DIY_WAIT_TOOL,
  DIY_EVAL_TOOL,
  DIY_SCREENSHOT_TOOL,
  DIY_NETWORK_TOOL,
  DIY_DIALOG_TOOL,
] as const;

const CSS_TOOL_NAMES = [
  DIY_FIND_TOOL,
  DIY_HTML_TOOL,
  DIY_CLICK_TOOL,
  DIY_HOVER_TOOL,
  DIY_TYPE_TOOL,
  DIY_FILL_TOOL,
  DIY_WAIT_TOOL,
] as const;

const CARD = '#wb-card-demo .wb-card';

function rowOf(tool: string): BrowserToolRow {
  const found = BROWSER_TOOLS.find((row) => row.tool === tool);
  if (found === undefined) throw new Error(`BROWSER_TOOLS 里没有 ${tool}`);
  return found;
}

describe('枚举暴露：14 把，就是 opencli 那套 verb', () => {
  it('★★ 那 14 把不多不少，_html 走多词的 get html', () => {
    expect([...BROWSER_TOOLS.map((row) => row.tool)].sort()).toEqual([...BROWSER_TOOL_NAMES].sort());

    for (const row of BROWSER_TOOLS) {
      expect(row.verb.length, row.tool).toBeGreaterThan(0);
      expect(row.description.trim(), row.tool).not.toBe('');
      expect(row.argsHelp.trim(), row.tool).not.toBe('');
    }
    expect(rowOf(DIY_HTML_TOOL).verb).toEqual(['get', 'html']);
  });

  it('★ 吃 CSS 目标的就那 7 把，位置参数与 flag 都说清', () => {
    expect(
      BROWSER_TOOLS.filter((row) => row.css !== undefined)
        .map((row) => row.tool)
        .sort(),
    ).toEqual([...CSS_TOOL_NAMES].sort());

    expect(rowOf(DIY_CLICK_TOOL).css).toEqual({ kind: 'positional', at: 0 });
    expect(rowOf(DIY_HOVER_TOOL).css).toEqual({ kind: 'positional', at: 0 });
    expect(rowOf(DIY_TYPE_TOOL).css).toEqual({ kind: 'positional', at: 0 });
    expect(rowOf(DIY_FILL_TOOL).css).toEqual({ kind: 'positional', at: 0 });
    expect(rowOf(DIY_WAIT_TOOL).css).toEqual({ kind: 'positional', at: 1, onlyWhenFirst: 'selector' });
    expect(rowOf(DIY_FIND_TOOL).css).toEqual({ kind: 'flag', flag: '--css' });
    expect(rowOf(DIY_HTML_TOOL).css).toEqual({ kind: 'flag', flag: '--selector' });
  });

  it('★ 14 把都注册进工坊，公共参数只有 unit / args / timeoutMs / read（scope / in / clip 按行加），不收 session', () => {
    const rig = browserRig({ answer: () => ({ stdout: PAGE }) });

    expect([...rig.registered.map((one) => one.name)].sort()).toEqual([...BROWSER_TOOL_NAMES].sort());

    for (const row of BROWSER_TOOLS) {
      const definition = rig.tool(row.tool);
      const properties = (definition.parameters?.['properties'] ?? {}) as Record<string, unknown>;
      const expected = [
        'args',
        'read',
        'timeoutMs',
        'unit',
        ...(row.css === undefined ? [] : ['scope']),
        ...(row.evalInCard === true ? ['in'] : []),
        ...(row.clip === true ? ['clip'] : []),
      ].sort();

      expect(Object.keys(properties).sort(), row.tool).toEqual(expected);
      expect(definition.parameters?.['additionalProperties'], row.tool).toBe(false);
    }
    rig.dispose();
  });
});

describe('argv 原样转发：只有 scope=card 才动 CSS 那一个位置', () => {
  it('★ 空串与非字符串丢掉，其余一个不改', () => {
    expect(argvOf(rowOf(DIY_STATE_TOOL), { args: ['--source', '', 3, null, 'ax'] }, 'demo')).toEqual([
      '--source',
      'ax',
    ]);
  });

  it('★★ $card 到处都换，与 scope 无关', () => {
    expect(
      argvOf(rowOf(DIY_FIND_TOOL), { args: ['--css', '$card .wb-cardOpen'], scope: 'page' }, 'demo'),
    ).toEqual(['--css', `${CARD} .wb-cardOpen`]);
    expect(argvOf(rowOf(DIY_KEYS_TOOL), { args: ['$card'] }, 'demo')).toEqual([CARD]);
  });

  it('★★ scope 缺省是 page：原样转发；scope=card 才加锚点前缀', () => {
    const click = rowOf(DIY_CLICK_TOOL);

    expect(argvOf(click, { args: ['.wb-cardOpen'] }, 'demo')).toEqual(['.wb-cardOpen']);
    expect(argvOf(click, { args: ['.wb-cardOpen'], scope: 'page' }, 'demo')).toEqual(['.wb-cardOpen']);
    expect(argvOf(click, { args: ['.wb-cardOpen'], scope: 'card' }, 'demo')).toEqual([`${CARD} .wb-cardOpen`]);
  });

  it('★ 不吃 CSS 的 7 把：scope=card 也不动', () => {
    for (const row of BROWSER_TOOLS.filter((one) => one.css === undefined)) {
      expect(argvOf(row, { args: ['Escape'], scope: 'card' }, 'demo'), row.tool).toEqual(['Escape']);
    }
  });

  it('★ flag 目标：给了就改值，没给就补一对', () => {
    const find = rowOf(DIY_FIND_TOOL);

    expect(argvOf(find, { args: ['--css', '.wb-cardOpen'], scope: 'card' }, 'demo')).toEqual([
      '--css',
      `${CARD} .wb-cardOpen`,
    ]);
    expect(argvOf(find, { args: ['--limit', '5'], scope: 'card' }, 'demo')).toEqual([
      '--limit',
      '5',
      '--css',
      CARD,
    ]);
    expect(argvOf(rowOf(DIY_HTML_TOOL), { args: [], scope: 'card' }, 'demo')).toEqual(['--selector', CARD]);
  });

  it('★★ --flag=value 等号式：前缀加在等号右边；两段式与补一对都照旧', () => {
    const find = rowOf(DIY_FIND_TOOL);

    expect(argvOf(find, { args: ['--css=.wb-cardOpen'], scope: 'card' }, 'demo')).toEqual([
      `--css=${CARD} .wb-cardOpen`,
    ]);
    expect(
      argvOf(rowOf(DIY_HTML_TOOL), { args: ['--selector=.wb-cardBody', '--as', 'json'], scope: 'card' }, 'demo'),
    ).toEqual([`--selector=${CARD} .wb-cardBody`, '--as', 'json']);
    expect(argvOf(find, { args: ['--css=.wb-cardOpen'], scope: 'page' }, 'demo')).toEqual(['--css=.wb-cardOpen']);
    expect(argvOf(find, { args: ['--limit=5'], scope: 'card' }, 'demo')).toEqual(['--limit=5', '--css', CARD]);
  });

  it('★ wait 只在第一个词是 selector 时才收窄', () => {
    const wait = rowOf(DIY_WAIT_TOOL);

    expect(argvOf(wait, { args: ['selector', '.wb-cardOpen'], scope: 'card' }, 'demo')).toEqual([
      'selector',
      `${CARD} .wb-cardOpen`,
    ]);
    expect(argvOf(wait, { args: ['text', '.wb-cardOpen'], scope: 'card' }, 'demo')).toEqual([
      'text',
      '.wb-cardOpen',
    ]);
  });

  it('★★ _eval 的 in:card 才包一层注入 root', () => {
    const wrapped = evalWrapped('const text = root.textContent; return text;', CARD);

    expect(wrapped).toContain(CARD);
    expect(wrapped).toContain('root');
    expect(wrapped).toContain('const text = root.textContent; return text;');

    const evalRow = rowOf(DIY_EVAL_TOOL);
    expect(argvOf(evalRow, { args: ['return root.textContent'], in: 'card' }, 'demo')[0]).toContain(CARD);
    expect(argvOf(evalRow, { args: ['return 1'] }, 'demo')).toEqual(['return 1']);
    expect(argvOf(evalRow, { args: ['return root.textContent'], in: 'page' }, 'demo')).toEqual([
      'return root.textContent',
    ]);
    expect(argvOf(evalRow, { args: ['--await', '1', 'return 1'], in: 'card' }, 'demo')).toEqual([
      '--await',
      '1',
      'return 1',
    ]);
  });

  it('★ 卡锚点就是外壳盖的那一个', () => {
    expect(cardSelectorIn('demo')).toBe(CARD);
  });
});

describe('只读线档：同一族、另一条会话', () => {
  it('★★ 给了 read 就跑 workbench-read：先核站点、再原样转发，绝不碰用户那一屏', async () => {
    const rig = browserRig({
      pact: false,
      answer: (line) => (line.includes("'get' 'url'") ? { stdout: 'https://site.example/a\n' } : { stdout: 'ok\n' }),
    });

    const out = await run(rig, DIY_FIND_TOOL, {
      read: 'https://site.example/a',
      args: ['--css', 'table tr', '--limit', '5'],
    });

    expect(rig.commands).toHaveLength(2);
    expect(rig.commands[0]).toContain('workbench-read');
    expect(rig.commands[0]).toContain("'get' 'url'");
    expect(rig.commands[1]).toContain('workbench-read');
    expect(rig.commands[1]).toContain("'find' '--css' 'table tr' '--limit' '5'");
    expect(rig.commands.some((one) => one.includes("browser workbench "))).toBe(false);
    expect(out.opened).toBe(false);
    expect(out.ok).toBe(true);
    expect(out.stdout).toBe('ok');
    expect(out.exitCode).toBe(0);
    expect(out.timedOut).toBe(false);
    expect(out.truncated).toBe(false);
    expect(out.argv).toEqual(['--css', 'table tr', '--limit', '5']);
    rig.dispose();
  });

  it('★ 不在那个站点上：自己 open 一次再跑（不偷偷读错页）', async () => {
    const rig = browserRig({
      answer: (line) => {
        if (line.includes("'get' 'url'")) return { stdout: 'https://other.example/\n' };
        return { stdout: 'ok\n' };
      },
    });

    const out = await run(rig, DIY_EVAL_TOOL, { read: 'https://site.example/a', args: ['return 1'] });

    expect(rig.commands).toHaveLength(3);
    expect(rig.commands[1]).toContain("'open' 'https://site.example/a'");
    expect(rig.commands[1]).toContain('workbench-read');
    expect(rig.commands[2]).toContain("'eval' 'return 1'");
    expect(out.opened).toBe(true);
  });

  it('★ eval 回 not-logged-in：只加一句人话，结果字段一个不改', async () => {
    const rig = browserRig({
      answer: (line) =>
        line.includes("'get' 'url'")
          ? { stdout: 'https://site.example/a\n' }
          : { stdout: JSON.stringify({ ok: false, code: 'not-logged-in' }), exitCode: 3 },
    });

    const out = await run(rig, DIY_EVAL_TOOL, { read: 'https://site.example/a', args: ['return 1'] });

    expect(out.stdout).toContain('not-logged-in');
    expect(out.stdout).toContain('去 https://site.example/a 登一次');
    expect(out.exitCode).toBe(3);
  });

  it('★★ 只读线不认卡作用域：unit / scope=card / in=card / $card 逐个拒，零命令', async () => {
    const rig = browserRig({ answer: () => ({ stdout: 'ok\n' }) });

    for (const raw of [
      { read: 'https://site.example/a', unit: 'demo', args: ['x'] },
      { read: 'https://site.example/a', scope: 'card', args: ['--css', 'x'] },
      { read: 'https://site.example/a', in: 'card', args: ['return 1'] },
      { read: 'https://site.example/a', args: ['$card .wb-cardOpen'] },
    ]) {
      await expect(run(rig, DIY_FIND_TOOL, raw)).rejects.toThrow(/只读线上没有/);
    }
    await expect(run(rig, DIY_EVAL_TOOL, { read: 'https://site.example/a', args: ['$card'] })).rejects.toThrow(
      /只读线上没有/,
    );
    expect(rig.commands).toHaveLength(0);
  });

  it('★ 只读线不裁剪：screenshot 的 clip 当场拒，零命令', async () => {
    const rig = browserRig({ answer: () => ({ stdout: 'ok\n' }) });

    await expect(
      run(rig, DIY_SCREENSHOT_TOOL, {
        read: 'https://site.example/a',
        clip: { x: 0, y: 0, width: 10, height: 10 },
      }),
    ).rejects.toThrow(/不截图裁剪/);
    expect(rig.commands).toHaveLength(0);
  });

  it('★ 屏那一档没给 read 时照旧要约定（只读线才是免约定的那档）', async () => {
    const rig = browserRig({ pact: false, answer: () => ({ stdout: PAGE }) });

    await expect(run(rig, DIY_STATE_TOOL, {})).rejects.toThrow(/没有调试约定|debug_start/);
    expect(rig.commands).toHaveLength(0);
  });
});
