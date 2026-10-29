import { describe, expect, it } from 'vitest';
import { BROWSER_SCREEN_SESSION } from '../browser-read.js';
import {
  browserFind,
  cellRows,
  cellRowsOf,
  entriesOf,
  reasonOf,
  sameOrigin,
  urlOf,
} from '../browser-find.js';

interface Step {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly timedOut?: boolean;
  readonly throws?: boolean;
}

interface Plan {
  readonly url?: string | readonly string[];
  readonly find?: readonly Step[];
  readonly open?: readonly Step[];
}

function fakeShell(plan: Plan) {
  const commands: string[] = [];
  const counters = { url: 0, find: 0, open: 0 };
  const pick = <T>(list: readonly T[] | undefined, index: number, fallback: T): T =>
    (list ?? [])[Math.min(index, Math.max(0, (list ?? []).length - 1))] ?? fallback;

  const shell = {
    resolve(request: { command: string }) {
      commands.push(request.command);
      return request;
    },
    async execute(spec: { command: string }) {
      const command = String(spec.command);
      let step: Step = {};
      let stdout = '';
      if (command.includes("'get'") && command.includes("'url'")) {
        const urls = typeof plan.url === 'string' ? [plan.url] : (plan.url ?? []);
        stdout = pick(urls, counters.url, '') as string;
        counters.url += 1;
      } else if (command.includes("'find'")) {
        step = pick(plan.find, counters.find, {});
        stdout = step.stdout ?? '';
        counters.find += 1;
      } else if (command.includes("'open'")) {
        step = pick(plan.open, counters.open, {});
        stdout = step.stdout ?? JSON.stringify({ page: 'AE4021' });
        counters.open += 1;
      }
      if (step.throws === true) throw new Error('spawn opencli ENOENT');
      return {
        result: async () => ({
          exitCode: step.exitCode ?? 0,
          timedOut: step.timedOut ?? false,
          aborted: false,
          stdout: { text: stdout, truncated: false },
          stderr: { text: step.stderr ?? '', truncated: false },
        }),
      };
    },
  };
  return { shell: shell as never, commands };
}

const FAST = { settleMs: 1, timeoutMs: 50 } as const;
const SITE = 'https://example.test/rates';
const OTHER = 'https://example.test/elsewhere';
const CSS = 'table tr';
const MATCH = JSON.stringify({ entries: [{ text: '美元\n673.30', tag: 'tr', nth: 1 }] });
const ZERO_MATCH = JSON.stringify({
  error: {
    code: 'selector_not_found',
    hint: 'try a less specific selector',
    message: 'CSS selector table tr matched 0 elements',
  },
});

describe('browserFind · 停在哪一页', () => {
  it('已经在目标站点上：只问一次 get url，然后一次 find', async () => {
    const { shell, commands } = fakeShell({ url: SITE, find: [{ stdout: MATCH }] });
    const out = await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(out.ok).toBe(true);
    expect(out.count).toBe(1);
    expect(out.entries[0]?.text).toBe('美元\n673.30');
    expect(commands.filter((one) => one.includes("'find'"))).toHaveLength(1);
    expect(commands.some((one) => one.includes("'open'"))).toBe(false);
    expect(commands[0]).toContain("'get' 'url'");
  });

  it('新会话还停在 about:blank：先 open 再读，命令走 find --css', async () => {
    const { shell, commands } = fakeShell({
      url: ['about:blank', SITE],
      find: [{ stdout: MATCH }],
    });
    const out = await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(out.ok).toBe(true);
    expect(out.count).toBe(1);
    expect(commands.some((one) => one.includes("'open'"))).toBe(true);
    expect(commands.filter((one) => one.includes("'find'"))).toHaveLength(1);
    expect(commands[1]).toContain("'open'");
    expect(commands[1]).toContain(SITE);
  });

  it('问不出来在哪一页（get url 空）时不乱开，直接找', async () => {
    const { shell, commands } = fakeShell({ url: '', find: [{ stdout: MATCH }] });
    const out = await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(out.ok).toBe(true);
    expect(commands.some((one) => one.includes("'open'"))).toBe(false);
  });

  it('open 失败 → cli-exec-failed，带上 helpUrl 与原因', async () => {
    const { shell } = fakeShell({
      url: 'about:blank',
      open: [{ stdout: JSON.stringify({ error: { message: 'browser session is not bound' } }), exitCode: 1 }],
    });
    const out = await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(out.ok).toBe(false);
    expect(out.code).toBe('cli-exec-failed');
    expect(out.message).toContain('打不开');
    expect(out.detail).toContain('not bound');
    expect(out.helpUrl).toBe(SITE);
  });

  it('open 那条命令直接抛（opencli 不在）也要报出来，不许把异常漏出去', async () => {
    const { shell } = fakeShell({ url: 'about:blank', open: [{ throws: true }] });
    const out = await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(out.ok).toBe(false);
    expect(out.code).toBe('cli-exec-failed');
    expect(out.detail).toContain('ENOENT');
  });
});

describe('browserFind · 找到与找不到', () => {
  it('页面上就是没有匹配元素 → ok，但 count 是 0（空不撒谎）', async () => {
    const { shell } = fakeShell({ url: SITE, find: [{ stdout: JSON.stringify({ entries: [] }) }] });
    const out = await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(out.ok).toBe(true);
    expect(out.count).toBe(0);
    expect(out.message).toContain('没有匹配');
  });

  it('在站点上但 find 失败（会话刚重启那类）：安全网再 open 一次并重读', async () => {
    const { shell, commands } = fakeShell({
      url: SITE,
      find: [{ stdout: ZERO_MATCH, exitCode: 1 }, { stdout: MATCH }],
    });
    const out = await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(out.ok).toBe(true);
    expect(out.count).toBe(1);
    expect(commands.filter((one) => one.includes("'find'"))).toHaveLength(2);
    expect(commands.some((one) => one.includes("'open'"))).toBe(true);
  });

  it('一直失败：把 opencli 自己在 stdout JSON 里说的原因当 message（不是 stderr）', async () => {
    const { shell } = fakeShell({
      url: SITE,
      find: [{ stdout: ZERO_MATCH, exitCode: 1 }, { stdout: ZERO_MATCH, exitCode: 1 }],
    });
    const out = await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(out.ok).toBe(false);
    expect(out.code).toBe('cli-exec-failed');
    expect(out.message).toContain('matched 0 elements');
    expect(out.hint).toBe('try a less specific selector');
    expect(out.helpUrl).toBe(SITE);
  });

  it('超时归成 cli-timeout，且不再折腾页面', async () => {
    const { shell, commands } = fakeShell({
      url: SITE,
      find: [{ timedOut: true, exitCode: 124 }],
    });
    const out = await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(out.ok).toBe(false);
    expect(out.code).toBe('cli-timeout');
    expect(out.detail).toContain('秒内返回');
    expect(commands.some((one) => one.includes("'open'"))).toBe(false);
  });

  it('url 没给：只 find，不问页面也不开', async () => {
    const { shell, commands } = fakeShell({ find: [{ stdout: MATCH }] });
    const out = await browserFind({ shell, css: CSS, ...FAST });

    expect(out.ok).toBe(true);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain("'find'");
  });

  it('open:false：只 find（不说自己在哪一页，也不开）', async () => {
    const { shell, commands } = fakeShell({
      url: SITE,
      find: [{ stdout: ZERO_MATCH, exitCode: 1 }, { stdout: MATCH }],
    });
    const out = await browserFind({ shell, css: CSS, url: SITE, open: false, ...FAST });

    expect(out.ok).toBe(false);
    expect(commands).toHaveLength(1);
  });

  it('opencli 根本没起来（find 那条抛）→ cli-exec-failed，带照做的话', async () => {
    const { shell } = fakeShell({ url: SITE, find: [{ throws: true }] });
    const out = await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(out.ok).toBe(false);
    expect(out.code).toBe('cli-exec-failed');
    expect(out.detail).toContain('ENOENT');
    expect(out.hint).toContain('后台服务');
  });

  it('session / command / limit / textMax 都能覆盖（命令行每个 token 都加引号）', async () => {
    const { shell, commands } = fakeShell({ url: SITE, find: [{ stdout: MATCH }] });
    await browserFind({
      shell,
      css: CSS,
      url: SITE,
      session: 'dsh-fx-rate',
      command: '/usr/local/bin/opencli',
      limit: 60,
      textMax: 400,
      ...FAST,
    });

    const findLine = commands.find((one) => one.includes("'find'")) ?? '';
    expect(commands[0]).toContain("'/usr/local/bin/opencli'");
    expect(commands[0]).toContain("'dsh-fx-rate'");
    expect(findLine).toContain("'--limit' '60'");
    expect(findLine).toContain("'--text-max' '400'");
  });
});

describe('cellRowsOf / reasonOf / sameOrigin', () => {
  it('按换行切格、丢掉空行、按 minCells 过滤', () => {
    const rows = cellRowsOf([
      { text: '货币名称\n现汇买入价\n\n现钞买入价\n现汇卖出价' },
      { text: '只有一个' },
      { text: undefined },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(['货币名称', '现汇买入价', '现钞买入价', '现汇卖出价']);
    expect(cellRowsOf([{ text: '一\n二' }], 3)).toEqual([]);
    expect(cellRows('a\n b \n\n')).toEqual(['a', 'b']);
  });

  it('reasonOf 优先取 error.message，没有才退回到最后一行', () => {
    expect(reasonOf(JSON.stringify({ error: { message: 'matched 0 elements' } }), '')).toBe(
      'matched 0 elements',
    );
    expect(reasonOf('', 'opencli: daemon not ready\nboom')).toBe('boom');
    expect(reasonOf('not json', '')).toBe('not json');
  });

  it('entriesOf 只认有 text 的项，缺 nth 用序号补', () => {
    const entries = entriesOf({
      entries: [{ text: 'a', tag: 'tr' }, { tag: 'tr' }, 'nope', { text: 'b', tag: 'tr', nth: 9 }],
    });

    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({ text: 'a', tag: 'tr', nth: 0 });
    expect(entries[2]).toEqual({ text: 'b', tag: 'tr', nth: 9 });
    expect(entriesOf(undefined)).toEqual([]);
    expect(entriesOf({ entries: 'nope' })).toEqual([]);
  });

  it('urlOf 认裸 URL、认带引号的、也认 {url} 的 JSON（判错的代价是每次多开一次页面）', () => {
    expect(urlOf('https://a.test/x\n')).toBe('https://a.test/x');
    expect(urlOf('URL: https://a.test/x')).toBe('https://a.test/x');
    expect(urlOf('"https://a.test/x"')).toBe('https://a.test/x');
    expect(urlOf('{"url":"https://a.test/x","title":"t"}')).toBe('https://a.test/x');
    expect(urlOf('')).toBe('');
  });

  it('sameOrigin 只看同源；空串或不是 URL 一律不算', () => {
    expect(sameOrigin('https://a.test/x', 'https://a.test/y')).toBe(true);
    expect(sameOrigin('https://a.test/x', 'https://b.test/y')).toBe(false);
    expect(sameOrigin('about:blank', SITE)).toBe(false);
    expect(sameOrigin('', SITE)).toBe(false);
    expect(sameOrigin('not a url', SITE)).toBe(false);
    expect(OTHER).toContain('elsewhere');
  });
});

function backgroundless(commands: readonly string[]): readonly string[] {
  return commands
    .filter((one) => one.includes("'browser'"))
    .filter(
      (one) => !one.includes("'--window' 'background'") || !one.includes("'OPENCLI_WINDOW=background'"),
    );
}

describe('browserFind · 后台静默（问页 + 读 + 打开都不许抢焦点）', () => {
  it('已经在目标站点上：get url + find 两条全带', async () => {
    const { shell, commands } = fakeShell({ url: SITE, find: [{ stdout: MATCH }] });
    await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(commands).toHaveLength(2);
    expect(backgroundless(commands)).toEqual([]);
  });

  it('不在目标站点上：get url + open + find 三条全带', async () => {
    const { shell, commands } = fakeShell({ url: ['about:blank', SITE], find: [{ stdout: MATCH }] });
    await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(commands.filter((one) => one.includes("'open'"))).toHaveLength(1);
    expect(backgroundless(commands)).toEqual([]);
  });
});

describe('browserFind · 读有它自己那条会话（不许碰屏那条）', () => {
  it('默认那条命令里一条都不带屏那条会话名', async () => {
    const { shell, commands } = fakeShell({ url: ['about:blank', SITE], find: [{ stdout: MATCH }] });
    await browserFind({ shell, css: CSS, url: SITE, ...FAST });

    expect(commands.length).toBeGreaterThan(0);
    expect(commands.some((one) => one.includes(`'${BROWSER_SCREEN_SESSION}'`))).toBe(false);
  });
});
