import { describe, expect, it } from 'vitest';
import { BROWSER_READ_SESSION, BROWSER_SCREEN_SESSION, browserRead } from '../browser-read.js';

interface Step {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly timedOut?: boolean;
}

function fakeShell(plan: readonly Step[]) {
  const commands: string[] = [];
  let index = 0;
  const shell = {
    resolve(request: { command: string }) {
      commands.push(request.command);
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
  };
  return { shell: shell as never, commands };
}

const FAST = { retryMs: 1, settleMs: 1, timeoutMs: 50 } as const;
const script = 'return 1';
const URL = 'https://example.test/wallet';

describe('browserRead · 读成功', () => {
  it('页面回 JSON → ok，命令走 `browser <session> eval`', async () => {
    const { shell, commands } = fakeShell([{ stdout: JSON.stringify({ ok: true, n: 3 }) }]);
    const out = await browserRead({ shell, script, url: URL, ...FAST });

    expect(out.ok).toBe(true);
    expect(out.code).toBe('ok');
    expect(out.value).toEqual({ ok: true, n: 3 });
    expect(commands[0]).toContain(`'browser' '${BROWSER_READ_SESSION}' 'eval'`);
  });

  it('脚本没回 ok 字段（例如直接回一个数）也算读到了', async () => {
    const { shell } = fakeShell([{ stdout: '42' }]);
    const out = await browserRead({ shell, script, ...FAST });
    expect(out.ok).toBe(true);
    expect(out.value).toBe(42);
  });
});

describe('browserRead · 平台码归一（不许透传）', () => {
  it('AUTH_UNAUTHORIZED → auth-required + helpUrl', async () => {
    const { shell } = fakeShell([
      { stdout: JSON.stringify({ ok: false, code: 'AUTH_UNAUTHORIZED', message: '登录已过期' }) },
    ]);
    const out = await browserRead({ shell, script, url: URL, loginUrl: 'https://sso.example.com', ...FAST });

    expect(out.ok).toBe(false);
    expect(out.code).toBe('auth-required');
    expect(out.pageCode).toBe('AUTH_UNAUTHORIZED');
    expect(out.helpUrl).toBe('https://sso.example.com');
    expect(out.message).toBe('登录已过期');
  });

  it('PERMISSION_DENIED → permission-denied', async () => {
    const { shell } = fakeShell([{ stdout: JSON.stringify({ ok: false, code: 'permission_denied' }) }]);
    const out = await browserRead({ shell, script, url: URL, ...FAST });
    expect(out.code).toBe('permission-denied');
  });

  it('业务码原样回（落到阻断屏的"其它"那一支）', async () => {
    const { shell } = fakeShell([
      { stdout: JSON.stringify({ ok: false, code: 'network', message: '连不上', hint: '稍后重试' }) },
    ]);
    const out = await browserRead({ shell, script, url: URL, ...FAST });
    expect(out.code).toBe('network');
    expect(out.pageCode).toBe('network');
    expect(out.message).toBe('连不上');
    expect(out.hint).toBe('稍后重试');
  });
});

describe('browserRead · 两拍（不在站点上就先打开）', () => {
  it('not-on-site → open（后台窗口）→ 再读一遍 → ok', async () => {
    const { shell, commands } = fakeShell([
      { stdout: JSON.stringify({ ok: false, code: 'not-on-site' }) },
      { stdout: 'opened' },
      { stdout: JSON.stringify({ ok: true }) },
    ]);
    const out = await browserRead({ shell, script, url: URL, ...FAST });

    expect(out.ok).toBe(true);
    expect(commands.some((one) => one.includes("'open'") && one.includes('--window'))).toBe(true);
    expect(commands.filter((one) => one.includes("'eval'"))).toHaveLength(2);
  });

  it('open 关了：直接说清"没停在那套系统上"', async () => {
    const { shell, commands } = fakeShell([{ stdout: JSON.stringify({ ok: false, code: 'not-on-site' }) }]);
    const out = await browserRead({ shell, script, url: URL, open: false, ...FAST });

    expect(out.ok).toBe(false);
    expect(out.message).toContain('没停在那套系统上');
    expect(commands.some((one) => one.includes("'open'"))).toBe(false);
  });

  it('打开之后还是不在站点上：报 cli-exec-failed（不是静默成功）', async () => {
    const { shell } = fakeShell([
      { stdout: JSON.stringify({ ok: false, code: 'not-on-site' }) },
      { stdout: 'opened' },
      { stdout: JSON.stringify({ ok: false, code: 'not-on-site' }) },
    ]);
    const out = await browserRead({ shell, script, url: URL, ...FAST });
    expect(out.code).toBe('cli-exec-failed');
    expect(out.message).toContain('仍然不在那套系统上');
  });
});

describe('browserRead · 读有它自己那条会话（不许碰屏那条）', () => {
  it('默认那条不是工坊绑用户当前页用的那条', () => {
    expect(BROWSER_READ_SESSION).not.toBe(BROWSER_SCREEN_SESSION);
  });

  it('两拍三条命令里一条都不带屏那条会话名', async () => {
    const { shell, commands } = fakeShell([
      { stdout: JSON.stringify({ ok: false, code: 'not-on-site' }) },
      { stdout: 'opened' },
      { stdout: JSON.stringify({ ok: true, n: 1 }) },
    ]);
    const out = await browserRead({ shell, script, url: URL, ...FAST });

    expect(out.ok).toBe(true);
    expect(commands.some((one) => one.includes(`'${BROWSER_SCREEN_SESSION}'`))).toBe(false);
  });

  it('调用点自己给的 session 说了算（模块可以自己开一条）', async () => {
    const { shell, commands } = fakeShell([
      { stdout: JSON.stringify({ ok: false, code: 'not-on-site' }) },
      { stdout: 'opened' },
      { stdout: JSON.stringify({ ok: true }) },
    ]);
    const out = await browserRead({ shell, script, url: URL, session: 'wallet', ...FAST });

    expect(out.ok).toBe(true);
    expect(commands.every((one) => one.includes("'wallet'"))).toBe(true);
    expect(commands.some((one) => one.includes(`'${BROWSER_SCREEN_SESSION}'`))).toBe(false);
  });
});

describe('browserRead · 命令这一层的问题', () => {
  it('刚重启时第一次失败：等一下再读一次就成功（实测的那个坑）', async () => {
    const { shell, commands } = fakeShell([
      { exitCode: 1, stderr: 'opencli: daemon not ready' },
      { stdout: JSON.stringify({ ok: true }) },
    ]);
    const out = await browserRead({ shell, script, ...FAST });
    expect(out.ok).toBe(true);
    expect(commands.filter((one) => one.includes("'eval'"))).toHaveLength(2);
  });

  it('一直失败 → cli-exec-failed + 原始输出尾巴', async () => {
    const { shell } = fakeShell([{ exitCode: 1, stderr: 'boom\nline2' }]);
    const out = await browserRead({ shell, script, ...FAST });
    expect(out.code).toBe('cli-exec-failed');
    expect(out.detail).toContain('boom');
  });

  it('stderr 里是权限问题 → permission-denied（不当成普通失败）', async () => {
    const { shell } = fakeShell([{ exitCode: 1, stderr: 'PERMISSION_DENIED: nope' }]);
    const out = await browserRead({ shell, script, ...FAST });
    expect(out.code).toBe('permission-denied');
  });

  it('超时 → cli-timeout，而且**不**重试（已经等满了）', async () => {
    const { shell, commands } = fakeShell([{ timedOut: true }]);
    const out = await browserRead({ shell, script, ...FAST });
    expect(out.code).toBe('cli-timeout');
    expect(commands.filter((one) => one.includes("'eval'"))).toHaveLength(1);
  });

  it('输出不是 JSON → cli-exec-failed 且说清是"不是 JSON"', async () => {
    const { shell } = fakeShell([{ stdout: 'not json at all' }]);
    const out = await browserRead({ shell, script, ...FAST });
    expect(out.code).toBe('cli-exec-failed');
    expect(out.message).toContain('格式不对');
  });
});

function backgroundless(commands: readonly string[]): readonly string[] {
  return commands
    .filter((one) => one.includes("'browser'"))
    .filter(
      (one) => !one.includes("'--window' 'background'") || !one.includes("'OPENCLI_WINDOW=background'"),
    );
}

describe('browserRead · 后台静默（每一拍都不许抢焦点）', () => {
  it('不在站点上那一趟：eval → open → eval 三条全带', async () => {
    const { shell, commands } = fakeShell([
      { stdout: JSON.stringify({ ok: false, code: 'not-on-site' }) },
      {},
      { stdout: JSON.stringify({ ok: true, n: 1 }) },
    ]);
    const out = await browserRead({ shell, script, url: URL, ...FAST });

    expect(out.ok).toBe(true);
    expect(commands.filter((one) => one.includes("'browser'"))).toHaveLength(3);
    expect(backgroundless(commands)).toEqual([]);
  });

  it('命令失败重试那一拍也带', async () => {
    const { shell, commands } = fakeShell([
      { exitCode: 1, stderr: 'boom' },
      { stdout: JSON.stringify({ ok: true }) },
    ]);
    await browserRead({ shell, script, url: URL, ...FAST });

    expect(commands.filter((one) => one.includes("'eval'"))).toHaveLength(2);
    expect(backgroundless(commands)).toEqual([]);
  });
});
