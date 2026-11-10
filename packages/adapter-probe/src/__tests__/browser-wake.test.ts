import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, win32 } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeShell } from '@dsh-workbench/shared/testing';
import { createSeam } from '@dsh-workbench/shared/host';
import { bridgeFixCommand, createDesktopBrowser } from '../index.js';

function seamFor(shell: Parameters<typeof createSeam>[0]['shell']) {
  return createSeam({ shell, runtimeRoot: '/tmp/wb-seam-test' });
}


const CHROME_APP = '/Applications/Google Chrome.app';
const EDGE_APP = '/Applications/Microsoft Edge.app';

interface Script {
  readonly status?: readonly string[];
  readonly running?: readonly string[];
  readonly open?: readonly number[];
  readonly saved?: string;
}

function wire(script: Script) {
  const dir = mkdtempSync(join(tmpdir(), 'wb-wake-'));
  const stateFile = join(dir, 'state', 'browser.json');
  if (script.saved !== undefined) {
    mkdirSync(join(dir, 'state'), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ browser: script.saved }), 'utf8');
  }
  let statusIndex = 0;
  let openIndex = 0;
  const fake = createFakeShell((call) => {
    if (call.command === "'opencli' daemon status") {
      const stdout = script.status?.[statusIndex] ?? '';
      statusIndex += 1;
      return { stdout };
    }
    if (call.command.startsWith('pgrep -lx')) {
      return { stdout: (script.running ?? []).map((name, index) => `${1000 + index} ${name}`).join('\n') };
    }
    if (call.command.startsWith('open -g -j -a')) {
      const exitCode = script.open?.[openIndex] ?? 0;
      openIndex += 1;
      return { exitCode };
    }
    return {};
  });
  const desktop = createDesktopBrowser({
    seam: seamFor(fake.shell),
    command: 'opencli',
    stateFile,
    platform: 'darwin',
    home: '/Users/who',
    exists: (path) => path === CHROME_APP || path === EDGE_APP,
    waitMs: 0,
    shortWaitMs: 0,
    pollMs: 0,
  });
  return { fake, desktop, stateFile };
}

const CONNECTED = 'Daemon: running (PID 1)\nExtension: connected (v1.0.26)\n';

function disconnected(): string {
  return 'Daemon: running (PID 1)\nExtension: disconnected\n';
}

describe('Desktop 浏览器唤醒', () => {
  it('通道本就通 → 只记住正在跑的那个浏览器，不打开任何东西', async () => {
    const { fake, desktop, stateFile } = wire({ status: [CONNECTED], running: ['Google Chrome'] });

    const result = await desktop.wake();

    expect(result).toEqual({ status: 'connected' });
    expect(fake.commands().some((line) => line.startsWith('open '))).toBe(false);
    expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toEqual({ browser: 'chrome' });
  });

  it('★ 没浏览器在跑 → 后台打开记住的那个，等它连上再算成功', async () => {
    const { fake, desktop, stateFile } = wire({
      status: [disconnected(), CONNECTED],
      running: [],
      open: [0],
    });

    const result = await desktop.wake();

    expect(result).toEqual({ status: 'connected', browser: 'chrome' });
    expect(fake.commands()).toContain(`open -g -j -a '${CHROME_APP}'`);
    expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toEqual({ browser: 'chrome' });
  });

  it('★ 浏览器已经开着（扩展没连）→ 不再开一个窗，也不谎报连上', async () => {
    const { fake, desktop } = wire({ status: [disconnected(), disconnected()], running: ['Google Chrome'] });

    const result = await desktop.wake();

    expect(result).toEqual({ status: 'browser-open', browser: 'chrome' });
    expect(fake.commands().some((line) => line.startsWith('open '))).toBe(false);
  });

  it('记住的是 Edge 就开 Edge（不被「先装的 Chrome」带偏）', async () => {
    const { fake, desktop } = wire({
      status: [disconnected(), CONNECTED],
      running: [],
      open: [0],
      saved: 'edge',
    });

    const result = await desktop.wake();

    expect(result).toEqual({ status: 'connected', browser: 'edge' });
    expect(fake.commands()).toContain(`open -g -j -a '${EDGE_APP}'`);
  });

  it('一个能开的浏览器都没有 → no-browser（不白跑 open）', async () => {
    const fake = createFakeShell(() => ({ stdout: disconnected() }));
    const desktop = createDesktopBrowser({
      seam: seamFor(fake.shell),
      command: 'opencli',
      stateFile: join(tmpdir(), 'wb-wake-none', 'browser.json'),
      platform: 'darwin',
      home: '/Users/who',
      exists: () => false,
      waitMs: 0,
      pollMs: 0,
    });

    expect(await desktop.wake()).toEqual({ status: 'no-browser' });
    expect(fake.commands().some((line) => line.startsWith('open '))).toBe(false);
  });

  it('open 失败 → launch-failed（如实说，不接着等）', async () => {
    const { desktop } = wire({ status: [disconnected()], running: [], open: [1] });

    const result = await desktop.wake();

    expect(result).toEqual({ status: 'launch-failed', browser: 'chrome' });
  });

  it('打开了但一直没连上 → not-connected（预检保留原来的 warn）', async () => {
    const { desktop } = wire({ status: [disconnected(), disconnected()], running: [], open: [0] });

    const result = await desktop.wake();

    expect(result).toEqual({ status: 'not-connected', browser: 'chrome' });
  });

  it('★ Windows 装了 Chrome 且没在跑 → cmd start 拉起来并等连接', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-wake-win-'));
    const stateFile = join(dir, 'state', 'browser.json');
    const exe = win32.join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');
    let statusIndex = 0;
    const fake = createFakeShell((call) => {
      if (call.command === "'opencli' daemon status") {
        const stdout = [disconnected(), CONNECTED][statusIndex] ?? CONNECTED;
        statusIndex += 1;
        return { exitCode: 0, stdout };
      }
      if (call.command === 'tasklist /FO CSV /NH') return { exitCode: 0, stdout: '' };
      if (call.command.startsWith('cmd /d /s /c start')) return { exitCode: 0 };
      return {};
    });
    const desktop = createDesktopBrowser({
      seam: seamFor(fake.shell),
      command: 'opencli',
      stateFile,
      platform: 'win32',
      env: { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\who\\AppData\\Local' },
      exists: (path) => path === exe,
      waitMs: 0,
      shortWaitMs: 0,
      pollMs: 0,
    });

    expect(await desktop.wake()).toEqual({ status: 'connected', browser: 'chrome' });
    expect(fake.commands().some((line) => line.startsWith('cmd /d /s /c start ""'))).toBe(true);
    expect(fake.commands().join('\n')).toContain('chrome.exe');
    expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toEqual({ browser: 'chrome' });
  });

  it('非 macOS/Linux/Windows 的平台仍然 unsupported，一条命令都不发', async () => {
    const fake = createFakeShell([]);
    const desktop = createDesktopBrowser({
      seam: seamFor(fake.shell),
      command: 'opencli',
      stateFile: join(tmpdir(), 'wb-wake-other', 'browser.json'),
      platform: 'freebsd',
      waitMs: 0,
      pollMs: 0,
    });

    expect(await desktop.wake()).toEqual({ status: 'unsupported' });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('observe（通道好时记住承载扩展的浏览器）', () => {
  it('只有一个在跑 → 记它；多个在跑 → 认 Chrome', async () => {
    const one = wire({ running: ['Brave Browser'] });
    await one.desktop.observe();
    expect(JSON.parse(readFileSync(one.stateFile, 'utf8'))).toEqual({ browser: 'brave' });

    const many = wire({ running: ['Microsoft Edge', 'Google Chrome'] });
    await many.desktop.observe();
    expect(JSON.parse(readFileSync(many.stateFile, 'utf8'))).toEqual({ browser: 'chrome' });
  });
});

describe('命令 token 按平台引号包住', () => {
  it('★ bridgeFixCommand 把整段路径包成一个 token（带空格也不散架）', () => {
    expect(bridgeFixCommand('C:\\Users\\John Smith\\opencli.cmd', ['daemon'], 'win32')).toBe(
      "'C:\\Users\\John Smith\\opencli.cmd' daemon restart",
    );
    expect(bridgeFixCommand('opencli', ['profile'], 'linux')).toBe("'opencli' profile list");
    expect(bridgeFixCommand('opencli', ['stale'], 'darwin')).toBe("'opencli' profile list");
    expect(bridgeFixCommand('opencli', ['extension'])).toBeUndefined();
  });

  it('★ win32 上带空格的隔离路径 → daemon status 里整段带引号', async () => {
    const command = 'C:\\Users\\John Smith\\.dsh\\workbench\\opencli\\bin\\opencli.cmd';
    const fake = createFakeShell((call) =>
      call.command === `'${command}' daemon status` ? { exitCode: 0, stdout: CONNECTED } : {},
    );
    const desktop = createDesktopBrowser({
      seam: seamFor(fake.shell),
      command,
      stateFile: join(tmpdir(), 'wb-wake-space', 'browser.json'),
      platform: 'win32',
      exists: () => false,
      waitMs: 0,
      pollMs: 0,
    });

    expect(await desktop.wake()).toEqual({ status: 'connected' });
    expect(fake.commands()[0]).toBe(`'${command}' daemon status`);
  });
});

describe('Linux 启动浏览器', () => {
  const linuxDesktop = (fake: ReturnType<typeof createFakeShell>) =>
    createDesktopBrowser({
      seam: seamFor(fake.shell),
      command: 'opencli',
      stateFile: join(tmpdir(), 'wb-wake-linux', 'browser.json'),
      platform: 'linux',
      exists: (path) => path === '/usr/bin/google-chrome',
      waitMs: 0,
      shortWaitMs: 0,
      pollMs: 0,
    });

  it('★ 这台机器没有 setsid → 如实报 launch-failed（不再谎报 not-connected）', async () => {
    const fake = createFakeShell((call) => {
      if (call.command === "'opencli' daemon status") return { exitCode: 0, stdout: disconnected() };
      if (call.command.startsWith('pgrep -lx')) return { exitCode: 1, stdout: '' };
      if (call.command === "command -v 'setsid'") return { exitCode: 127, stdout: '' };
      return {};
    });

    expect(await linuxDesktop(fake).wake()).toEqual({ status: 'launch-failed', browser: 'chrome' });
    expect(fake.commands().some((line) => line.startsWith('setsid '))).toBe(false);
  });

  it('★ 有 setsid → 照旧 setsid 起它', async () => {
    const fake = createFakeShell((call) => {
      if (call.command === "'opencli' daemon status") {
        return { exitCode: 0, stdout: disconnected() };
      }
      if (call.command.startsWith('pgrep -lx')) return { exitCode: 1, stdout: '' };
      if (call.command === "command -v 'setsid'") return { exitCode: 0, stdout: '/usr/bin/setsid\n' };
      if (call.command.startsWith('setsid ')) return { exitCode: 0 };
      return {};
    });

    expect(await linuxDesktop(fake).wake()).toEqual({ status: 'not-connected', browser: 'chrome' });
    expect(fake.commands()).toContain(
      "setsid '/usr/bin/google-chrome' --no-startup-window >/dev/null 2>&1 < /dev/null &",
    );
  });
});
