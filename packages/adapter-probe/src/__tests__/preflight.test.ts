import { describe, expect, it, vi } from 'vitest';
import type { DshShell } from '@dsh-workbench/shared';
import { classifyFailure, createPreflight, opencliInstallCommandDefault } from '../index.js';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { ALL_OK, BROKEN_BRIDGE, EXTENSION_ONLY_BRIDGE, GOOD_BRIDGE_REPORT, build } from './preflight-fixtures';

describe('createPreflight', () => {
  it('环境齐了 → 两步都 ok，放行', async () => {
    const { fake, preflight } = build(ALL_OK);
    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps.map((item) => `${item.id}=${item.status}`)).toEqual(['cli=ok', 'bridge=ok']);
    expect(snapshot.steps[0]?.detail).toBe('1.8.8');
    expect(fake.calls.map((call) => call.command)).toEqual(['opencli --version', 'opencli doctor']);
  });

  it('缺 opencli → 自动安装 → 重探 → 放行；安装期间界面能拿到"正在执行的动作"', async () => {
    const { fake, preflight } = build(
      [
        { exitCode: 127, stderr: 'command not found: opencli' },
        { stdout: '1.8.8\n' },
        { stdout: 'ok\n' },
      ],
      async () => {
        const during = preflight.snapshot();
        expect(during.phase).toBe('installing');
        expect(during.steps[0]?.action).toBe('安装 opencli');
        expect(during.steps[0]?.log).toContain('> 安装 opencli');
        expect(during.steps[0]?.command).toBe(opencliInstallCommandDefault());
        return { ok: true, detail: 'added 1 package' };
      },
    );

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps[0]?.status).toBe('ok');
    expect(fake.calls.map((call) => call.command)).toEqual([
      'opencli --version',
      'opencli --version',
      'opencli doctor',
    ]);
  });

  it('装不上 → 停住，并给出确切命令与原始输出', async () => {
    const { preflight } = build([{ exitCode: 127, stderr: 'command not found: opencli' }], async () => ({
      ok: false,
      detail: 'EACCES: permission denied',
    }));

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('failed');
    expect(snapshot.error).toContain('EACCES');
    expect(snapshot.steps[0]?.status).toBe('failed');
    expect(snapshot.steps[0]?.command).toBe(opencliInstallCommandDefault());
  });

  it('某一拍自己抛了 → 收成 failed 那一屏，不把 run 的 promise 甩出去（否则宿主会当致命错误退出）', async () => {
    const fake = createFakeShell([{ stdout: '1.8.8\n' }, { stdout: GOOD_BRIDGE_REPORT }]);
    const preflight = createPreflight({
      shell: fake.shell,
      probeDiy: () => {
        throw new Error('读套件声明的热身命令时炸了');
      },
    });

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('failed');
    expect(snapshot.error).toContain('热身命令');
    expect(snapshot.failure).toBe('unknown');
    expect(preflight.snapshot().phase).toBe('failed');
  });

  it('装完仍然调不动（PATH 没生效）→ 也算失败，不假放行', async () => {
    const { preflight } = build(
      [
        { exitCode: 127, stderr: 'not found' },
        { exitCode: 127, stderr: 'still not found' },
      ],
      async () => ({ ok: true, detail: 'installed' }),
    );

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('failed');
    expect(snapshot.steps[0]?.status).toBe('failed');
  });

  it('bridge 不通 → 只警告，照样放行，并把 doctor 的输出带出来', async () => {
    const { preflight } = build([
      { stdout: '1.8.8\n' },
      { exitCode: 1, stderr: 'bridge: not reachable' },
    ]);

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps[1]?.status).toBe('warn');
    expect(snapshot.steps[1]?.detail).toContain('not reachable');
    expect(snapshot.bridgeIssues).toEqual(['unknown']);
    expect(snapshot.steps[1]?.command).toBeUndefined();
  });

  it('★ 浏览器通道坏：`doctor` 明明 exit 0（报告里写着 not connected），要按报告判，不能看退出码', async () => {
    const { preflight } = build([{ stdout: '1.8.8\n' }, { stdout: BROKEN_BRIDGE }]);

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('ready');
    expect(snapshot.steps[1]?.status).toBe('warn');
    expect(snapshot.bridgeIssues).toEqual(['daemon', 'extension']);
    expect(snapshot.steps[1]?.command).toBe('opencli daemon restart');
    expect(snapshot.steps[1]?.detail).toContain('chrome://extensions');
  });

  it('★ 通道好时 detail 取"Everything looks good!"，不是输出的最后一行（那可能是升级提示）', async () => {
    const { preflight } = build([
      { stdout: '1.8.8\n' },
      { stdout: `${GOOD_BRIDGE_REPORT}\n\n  Update available: v1.8.7 → v1.8.8\n  Run: npm install -g @jackwener/opencli\n` },
    ]);

    const snapshot = await preflight.run();

    expect(snapshot.steps[1]?.status).toBe('ok');
    expect(snapshot.steps[1]?.detail).toBe('Everything looks good!');
    expect(snapshot.bridgeIssues).toBeUndefined();
  });

  it('★ 没选默认 profile：先说"选哪个"，命令也给 profile list（重启服务解决不了它）', async () => {
    const report = [
      'opencli v1.8.7 doctor (node v24.15.0)',
      '',
      '[OK] Daemon: running on port 19825 (v1.8.7)',
      '[MISSING] Extension: not connected',
      '[OK] Connectivity: connected in 0.0s',
      '',
      'Issues:',
      '  • Multiple Chrome profiles are connected to the daemon, but no default profile was selected.',
      '  Run opencli profile list, then opencli profile use <name>, or pass --profile <name>.',
    ].join('\n');
    const { preflight } = build([{ stdout: '1.8.8\n' }, { stdout: report }]);

    const snapshot = await preflight.run();

    expect(snapshot.steps[1]?.status).toBe('warn');
    expect(snapshot.bridgeIssues).toEqual(['profile']);
    expect(snapshot.steps[1]?.command).toBe('opencli profile list');
  });

  it('★ 扩展有更新可用（通道仍通）不算坏：不谎报成 warn', async () => {
    const { preflight } = build([{ stdout: '1.8.8\n' }, { stdout: `${GOOD_BRIDGE_REPORT}\nIssues:\n  • Extension update available: v1.0.24 → v1.0.25\n` }]);

    const snapshot = await preflight.run();

    expect(snapshot.steps[1]?.status).toBe('ok');
    expect(snapshot.bridgeIssues).toBeUndefined();
  });

  it('幂等：重复 run 不重跑命令（体检结果不缓存数据，但也不该被轮询放大）', async () => {
    const { fake, preflight } = build(ALL_OK);

    await preflight.run();
    const before = fake.calls.length;
    await preflight.run();

    expect(fake.calls.length).toBe(before);
    expect(preflight.snapshot().phase).toBe('ready');
  });

  it('hard 会重探（用户按的「重试」走它，不看新鲜度）', async () => {
    const { fake, preflight } = build([...ALL_OK, ...ALL_OK]);

    await preflight.run();
    const first = fake.calls.length;
    const snapshot = await preflight.run({ hard: true });

    expect(fake.calls.length).toBeGreaterThan(first);
    expect(snapshot.phase).toBe('ready');
  });

  it('★ 两页同时打开：第二页跟着第一页那一轮，不再排第二轮', async () => {
    const { fake, preflight } = build([...ALL_OK, ...ALL_OK]);

    const first = preflight.run();
    const second = preflight.run();
    await Promise.all([first, second]);

    expect(fake.calls.map((call) => call.command)).toEqual(['opencli --version', 'opencli doctor']);
    expect(preflight.snapshot().phase).toBe('ready');
  });

  it('★ 刚跑出 ready 再问一次不重跑：第二页拿到的就是上一份', async () => {
    const { fake, preflight } = build(ALL_OK);

    const done = await preflight.run();
    const again = await preflight.run();

    expect(fake.calls.map((call) => call.command)).toEqual(['opencli --version', 'opencli doctor']);
    expect(again).toEqual(done);
  });

  it('★ 上一轮是 failed：再问一次照样重跑（修完东西刷新就该好，不用等新鲜期）', async () => {
    const { fake, preflight } = build(
      [
        { exitCode: 127, stderr: 'command not found: opencli' },
        { stdout: '1.8.8\n' },
        { stdout: GOOD_BRIDGE_REPORT },
      ],
      async () => ({ ok: false, detail: 'EACCES: permission denied' }),
    );

    const broken = await preflight.run();
    expect(broken.phase).toBe('failed');
    const before = fake.calls.length;

    const healed = await preflight.run();

    expect(healed.phase).toBe('ready');
    expect(fake.calls.length).toBeGreaterThan(before);
  });

  it('装不上 → guidance: install（该给安装命令）', async () => {
    const { preflight } = build([{ exitCode: 127, stderr: 'command not found: opencli' }], async () => ({
      ok: false,
      detail: 'npm ERR! code EACCES\nnpm ERR! permission denied',
    }));

    const snapshot = await preflight.run();

    expect(snapshot.guidance).toBe('install');
    expect(snapshot.failure).toBe('permission');
  });

  it('装完还找不到 → guidance: path（别再让用户装一遍）', async () => {
    const { preflight } = build(
      [
        { exitCode: 127, stderr: 'not found' },
        { exitCode: 127, stderr: 'still not found' },
      ],
      async () => ({ ok: true, detail: 'installed' }),
    );

    const snapshot = await preflight.run();

    expect(snapshot.guidance).toBe('path');
  });

  it('执行缝本身坏了 → guidance: shell（用户自己装不了这个）', async () => {
    const { preflight } = build([{ failWith: new Error('shell 挂了') }], async () => ({
      ok: true,
      detail: '不该被调到',
    }));

    const snapshot = await preflight.run();

    expect(snapshot.guidance).toBe('shell');
  });

  it('执行缝本身坏了 → 直接失败，**不**去跑 npm install（装了也不可能成功）', async () => {
    const install = vi.fn(async () => ({ ok: true, detail: '不该被调到' }));
    const { fake, preflight } = build([{ failWith: new Error('shell 挂了') }], install);

    const snapshot = await preflight.run();

    expect(snapshot.phase).toBe('failed');
    expect(snapshot.error).toContain('shell 挂了');
    expect(install).not.toHaveBeenCalled();
    expect(fake.calls).toHaveLength(1);
  });

  it('重探会清掉上一轮的结果（不然界面一边"安装中"一边挂着旧的 ✓）', async () => {
    let duringInstall: string | undefined | null = null;
    const { preflight } = build(
      [
        { stdout: '1.8.8\n' },
        { stdout: 'ok\n' },
        { exitCode: 127, stderr: 'gone' },
        { stdout: '9.9.9\n' },
        { stdout: 'ok\n' },
      ],
      async () => {
        duringInstall = preflight.snapshot().steps[0]?.detail ?? undefined;
        return { ok: true, detail: 'installed' };
      },
    );

    await preflight.run();
    expect(preflight.snapshot().steps[0]?.detail).toBe('1.8.8');

    await preflight.run({ hard: true });
    expect(duringInstall).toBeUndefined();
  });

  it('带着一轮没跑完又来一次 hard：跟着那一轮，不另起第二轮', async () => {
    const { fake, preflight } = build([...ALL_OK, ...ALL_OK]);

    const first = preflight.run();
    const second = preflight.run({ hard: true });
    await Promise.all([first, second]);

    expect(fake.calls.map((call) => call.command)).toEqual([
      'opencli --version',
      'opencli doctor',
    ]);
    expect(preflight.snapshot().phase).toBe('ready');
  });

  it('三页同时强探：合并成一轮且**不交错**（交错是"phase ready 但某步还在 running"的根因）', async () => {
    const { fake, preflight } = build([...ALL_OK, ...ALL_OK]);

    await Promise.all([preflight.run({ hard: true }), preflight.run({ hard: true }), preflight.run({ hard: true })]);

    const commands = fake.calls.map((call) => call.command);
    expect(commands).toEqual([
      'opencli --version',
      'opencli doctor',
    ]);
    expect(preflight.snapshot().phase).toBe('ready');
    expect(preflight.snapshot().steps.every((item) => item.status === 'ok')).toBe(true);
  });

  it('日志里留下一行体检结果（排障用）', async () => {
    const fake = createFakeShell(ALL_OK);
    const warn = vi.fn();
    const preflight = createPreflight({ shell: fake.shell, logger: { warn } });

    await preflight.run();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cli=ok'));
  });
});

describe('Desktop：浏览器没开时，等用户点「打开浏览器」再开', () => {
  it('★ 只有扩展没连上 → **不**自动开（开窗会抢前台），只把「可以点」交给界面', async () => {
    const observe = vi.fn(async () => undefined);
    const wake = vi.fn(async () => ({ status: 'connected' as const, browser: 'chrome' as const }));
    const fake = createFakeShell([{ stdout: '1.8.8\n' }, { stdout: EXTENSION_ONLY_BRIDGE }]);
    const preflight = createPreflight({ shell: fake.shell, desktopBrowser: { observe, wake } });

    const snapshot = await preflight.run();

    expect(wake).not.toHaveBeenCalled();
    expect(fake.commands()).toEqual(['opencli --version', 'opencli doctor']);
    expect(snapshot.steps[1]?.status).toBe('warn');
    expect(snapshot.steps[1]?.command).toBeUndefined();
    expect(snapshot.bridgeIssues).toEqual(['extension']);
    expect(snapshot.canWakeBrowser).toBe(true);
  });

  it('★ 通道本来就好 → 记住哪个浏览器在承载扩展；快照仍带 canWakeBrowser', async () => {
    const observe = vi.fn(async () => undefined);
    const wake = vi.fn(async () => ({ status: 'connected' as const }));
    const fake = createFakeShell(ALL_OK.map((step) => ({ ...step })));
    const preflight = createPreflight({ shell: fake.shell, desktopBrowser: { observe, wake } });

    const snapshot = await preflight.run();

    expect(observe).toHaveBeenCalledTimes(1);
    expect(wake).not.toHaveBeenCalled();
    expect(snapshot.phase).toBe('ready');
    expect(snapshot.canWakeBrowser).toBe(true);
  });

  it('★ 不是桌面版（没有 desktopBrowser）→ 快照不带 canWakeBrowser，界面不会画那颗按钮', async () => {
    const fake = createFakeShell([{ stdout: '1.8.8\n' }, { stdout: EXTENSION_ONLY_BRIDGE }]);
    const preflight = createPreflight({ shell: fake.shell });

    const snapshot = await preflight.run();

    expect(snapshot.canWakeBrowser).toBeUndefined();
  });
});

describe('classifyFailure（失败时给人话指引的依据）', () => {
  it('权限问题 → permission（该提示 sudo / 全局目录）', () => {
    expect(classifyFailure("npm ERR! code EACCES\nnpm ERR! permission denied, open '/usr/local/lib'")).toBe('permission');
    expect(classifyFailure('EPERM: operation not permitted')).toBe('permission');
  });

  it('网络问题 → network（该提示查代理）', () => {
    expect(classifyFailure('npm ERR! code ENOTFOUND')).toBe('network');
    expect(classifyFailure('request to https://registry.npmjs.org failed, reason: ETIMEDOUT')).toBe('network');
  });

  it('命令不存在 → missing', () => {
    expect(classifyFailure('command not found: opencli')).toBe('missing');
  });

  it('认不出来就说认不出来（不硬猜）', () => {
    expect(classifyFailure('something odd happened')).toBe('unknown');
  });
});

function scriptedShell(hangOn: (command: string, timesSeen: number) => boolean) {
  const calls: string[] = [];
  const shell: DshShell = {
    resolve: (request) => {
      calls.push((request as { command: string }).command);
      return request;
    },
    execute: async () => ({
      result: async () => {
        const seen = calls.filter((call) => call === calls[calls.length - 1]).length;
        const command = calls[calls.length - 1] ?? '';
        if (hangOn(command, seen)) return new Promise<never>(() => {});
        return {
          exitCode: 0,
          timedOut: false,
          aborted: false,
          stdout: { text: command.endsWith('doctor') ? GOOD_BRIDGE_REPORT : '1.8.8\n', truncated: false },
          stderr: { text: '', truncated: false },
        };
      },
    }),
  };
  return { shell, calls };
}

const TOOLCHAIN_OK = {
  ok: true,
  detail: 'node v24.21.0（Desktop 自带）· npm 10.9.4 · pnpm 10.32.1',
  nodeMissing: false,
  npmMissing: false,
  pnpmProblem: false,
  stalled: false,
};

describe('宿主不交回命令结果（沙箱 / 子进程起不来）', () => {
  it('★ 版本命令没返回 → 40 秒内停住走 host 那档，后面的 doctor 一条都不发', async () => {
    vi.useFakeTimers();
    try {
      const fake = scriptedShell((command) => command === 'opencli --version');
      const preflight = createPreflight({ shell: fake.shell, probeToolchain: async () => TOOLCHAIN_OK });
      const pending = preflight.run();
      await vi.advanceTimersByTimeAsync(40_000);
      const snapshot = await pending;

      expect(snapshot.phase).toBe('failed');
      expect(snapshot.guidance).toBe('host');
      expect(snapshot.failure).toBe('host');
      expect(fake.calls).toEqual(['opencli --version']);
      expect(snapshot.steps.find((step) => step.id === 'cli')?.status).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('★ 版本通了、doctor 没返回 → 也停住走 host 那档，不再白等第二遍', async () => {
    vi.useFakeTimers();
    try {
      const fake = scriptedShell((command) => command === 'opencli doctor');
      const preflight = createPreflight({ shell: fake.shell, probeToolchain: async () => TOOLCHAIN_OK });
      const pending = preflight.run();
      await vi.advanceTimersByTimeAsync(130_000);
      const snapshot = await pending;

      expect(snapshot.phase).toBe('failed');
      expect(snapshot.guidance).toBe('host');
      expect(fake.calls).toEqual(['opencli --version', 'opencli doctor']);
      expect(snapshot.steps.find((step) => step.id === 'bridge')?.status).toBe('failed');
    } finally {
      vi.useRealTimers();
    }
  });

  it('★ 重试要重新探：上一次卡住不把这一次也判死', async () => {
    vi.useFakeTimers();
    try {
      const fake = scriptedShell((command, seen) => command === 'opencli --version' && seen === 1);
      const preflight = createPreflight({ shell: fake.shell, probeToolchain: async () => TOOLCHAIN_OK });

      const first = preflight.run();
      await vi.advanceTimersByTimeAsync(130_000);
      expect((await first).guidance).toBe('host');

      const second = preflight.run({ hard: true });
      await vi.advanceTimersByTimeAsync(130_000);
      const snapshot = await second;

      expect(snapshot.phase).toBe('ready');
      expect(fake.calls.filter((call) => call === 'opencli doctor')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
