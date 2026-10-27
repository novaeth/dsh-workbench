import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, win32 } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { DshShell } from '@dsh-workbench/shared';
import { quoteShellArg, runShell } from '@dsh-workbench/shared/host';
import type { DesktopBrowserId, WakeBrowserReply } from '@dsh-workbench/shared/contract/protocol/preflight-wake';

const BROWSER_IDS = ['chrome', 'edge', 'brave', 'chromium', 'vivaldi'] as const;

export interface DesktopBrowser {
  observe(): Promise<void>;
  wake(): Promise<WakeBrowserReply>;
}

interface BrowserSpec {
  readonly id: DesktopBrowserId;
  readonly label: string;
  readonly macProcess: string;
  readonly linuxBinary: string;
  readonly linuxProcess: string;
}

const BROWSERS: readonly BrowserSpec[] = [
  {
    id: 'chrome',
    label: 'Google Chrome',
    macProcess: 'Google Chrome',
    linuxBinary: '/usr/bin/google-chrome',
    linuxProcess: 'chrome',
  },
  {
    id: 'edge',
    label: 'Microsoft Edge',
    macProcess: 'Microsoft Edge',
    linuxBinary: '/usr/bin/microsoft-edge',
    linuxProcess: 'msedge',
  },
  {
    id: 'brave',
    label: 'Brave Browser',
    macProcess: 'Brave Browser',
    linuxBinary: '/usr/bin/brave-browser',
    linuxProcess: 'brave',
  },
  {
    id: 'chromium',
    label: 'Chromium',
    macProcess: 'Chromium',
    linuxBinary: '/usr/bin/chromium',
    linuxProcess: 'chromium',
  },
  {
    id: 'vivaldi',
    label: 'Vivaldi',
    macProcess: 'Vivaldi',
    linuxBinary: '/usr/bin/vivaldi',
    linuxProcess: 'vivaldi-bin',
  },
];

const WAKE_WAIT_MS = 12_000;
const SHORT_WAIT_MS = 3_000;
const POLL_MS = 500;
const STATUS_TIMEOUT_MS = 5_000;
const LAUNCH_TIMEOUT_MS = 10_000;

function isBrowserId(value: unknown): value is DesktopBrowserId {
  return typeof value === 'string' && (BROWSER_IDS as readonly string[]).includes(value);
}

function specOf(id: DesktopBrowserId): BrowserSpec {
  return BROWSERS.find((item) => item.id === id) ?? BROWSERS[0]!;
}

export function createDesktopBrowser(options: {
  shell: DshShell;
  command: string;
  stateFile: string;
  platform?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
  logger?: { warn?(message: string): void } | undefined;
  exists?: (path: string) => boolean;
  waitMs?: number;
  shortWaitMs?: number;
  pollMs?: number;
}): DesktopBrowser {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const waitMs = options.waitMs ?? WAKE_WAIT_MS;
  const shortWaitMs = options.shortWaitMs ?? SHORT_WAIT_MS;
  const pollMs = options.pollMs ?? POLL_MS;
  const command = options.command;

  async function run(line: string, timeoutMs: number): Promise<{ ok: boolean; stdout: string }> {
    try {
      const result = await runShell(options.shell, line, { timeoutMs });
      return { ok: result.exitCode === 0 && !result.timedOut, stdout: result.stdout };
    } catch {
      return { ok: false, stdout: '' };
    }
  }

  function winCandidates(id: DesktopBrowserId): string[] {
    const programFiles = env.ProgramFiles ?? env.PROGRAMFILES ?? 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    const relative: Readonly<Record<DesktopBrowserId, readonly string[]>> = {
      chrome: ['Google', 'Chrome', 'Application', 'chrome.exe'],
      edge: ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
      brave: ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
      chromium: ['Chromium', 'Application', 'chrome.exe'],
      vivaldi: ['Vivaldi', 'Application', 'vivaldi.exe'],
    };
    const bases =
      id === 'edge' || id === 'chrome' || id === 'brave'
        ? [programFiles, programFilesX86, localAppData]
        : [localAppData, programFiles];
    return bases.map((base) => win32.join(base, ...relative[id]));
  }

  function winExecutable(id: DesktopBrowserId): string | undefined {
    return winCandidates(id).find((path) => exists(path));
  }

  function installed(): DesktopBrowserId[] {
    return BROWSERS.filter((spec) => {
      if (platform === 'darwin') {
        return (
          exists(`/Applications/${spec.label}.app`) ||
          exists(join(home, 'Applications', `${spec.label}.app`))
        );
      }
      if (platform === 'linux') return exists(spec.linuxBinary);
      if (platform === 'win32') return winExecutable(spec.id) !== undefined;
      return false;
    }).map((spec) => spec.id);
  }

  function readSaved(): DesktopBrowserId | undefined {
    try {
      const raw: unknown = JSON.parse(readFileSync(options.stateFile, 'utf8'));
      if (typeof raw !== 'object' || raw === null) return undefined;
      const value = (raw as Readonly<Record<string, unknown>>).browser;
      return isBrowserId(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  function save(id: DesktopBrowserId): void {
    try {
      mkdirSync(dirname(options.stateFile), { recursive: true });
      writeFileSync(options.stateFile, `${JSON.stringify({ browser: id }, null, 2)}\n`, 'utf8');
    } catch {
      return;
    }
  }

  async function running(): Promise<DesktopBrowserId[]> {
    if (platform === 'darwin' || platform === 'linux') {
      const names = BROWSERS.map((spec) =>
        quoteShellArg(platform === 'darwin' ? spec.macProcess : spec.linuxProcess),
      );
      const result = await run(`pgrep -lx ${names.join(' ')}`, STATUS_TIMEOUT_MS);
      const found: DesktopBrowserId[] = [];
      for (const line of result.stdout.split('\n')) {
        const match = /^\s*\d+\s+(.+?)\s*$/.exec(line);
        const name = match?.[1];
        if (name === undefined) continue;
        const spec = BROWSERS.find(
          (item) =>
            item.macProcess === name || item.linuxProcess === name,
        );
        if (spec !== undefined && !found.includes(spec.id)) found.push(spec.id);
      }
      return found;
    }
    if (platform === 'win32') {
      const result = await run('tasklist /FO CSV /NH', STATUS_TIMEOUT_MS);
      const found: DesktopBrowserId[] = [];
      for (const line of result.stdout.split('\n')) {
        const name = /^"([^"]+)"/.exec(line)?.[1]?.toLowerCase();
        if (name === 'chrome.exe') found.push('chrome');
        if (name === 'msedge.exe') found.push('edge');
        if (name === 'brave.exe') found.push('brave');
        if (name === 'chromium.exe') found.push('chromium');
        if (name === 'vivaldi.exe') found.push('vivaldi');
      }
      return [...new Set(found)];
    }
    return [];
  }

  async function daemonStatus(): Promise<'connected' | 'disconnected' | 'down' | 'unknown'> {
    const result = await run(`${command} daemon status`, STATUS_TIMEOUT_MS);
    if (!result.ok) return 'unknown';
    if (/^Daemon: not running/m.test(result.stdout)) return 'down';
    if (/^Extension: connected/m.test(result.stdout)) return 'connected';
    if (/^Extension:/m.test(result.stdout)) return 'disconnected';
    return 'unknown';
  }

  async function waitConnected(ms: number): Promise<boolean> {
    const deadline = Date.now() + ms;
    for (;;) {
      if ((await daemonStatus()) === 'connected') return true;
      if (Date.now() >= deadline) return false;
      await delay(Math.min(pollMs, Math.max(0, deadline - Date.now())));
    }
  }

  function pickTarget(now: readonly DesktopBrowserId[]): DesktopBrowserId | undefined {
    const have = installed();
    if (have.length === 0) return undefined;
    const saved = readSaved();
    if (saved !== undefined && have.includes(saved)) return saved;
    const awake = have.filter((id) => now.includes(id));
    if (awake.length === 1) return awake[0];
    return have[0];
  }

  function appPath(id: DesktopBrowserId): string {
    const label = specOf(id).label;
    const local = `/Applications/${label}.app`;
    return exists(local) ? local : join(home, 'Applications', `${label}.app`);
  }

  async function launch(id: DesktopBrowserId): Promise<boolean> {
    if (platform === 'darwin') {
      const result = await run(`open -g -j -a ${quoteShellArg(appPath(id))}`, LAUNCH_TIMEOUT_MS);
      return result.ok;
    }
    if (platform === 'linux') {
      const binary = quoteShellArg(specOf(id).linuxBinary);
      const result = await run(
        `setsid ${binary} --no-startup-window >/dev/null 2>&1 < /dev/null &`,
        LAUNCH_TIMEOUT_MS,
      );
      return result.ok;
    }
    if (platform === 'win32') {
      const exe = winExecutable(id);
      if (exe === undefined) return false;
      const result = await run(`cmd /d /s /c start "" ${quoteShellArg(exe)}`, LAUNCH_TIMEOUT_MS);
      return result.ok;
    }
    return false;
  }

  async function observe(): Promise<void> {
    const now = await running();
    if (now.length === 0) return;
    const saved = readSaved();
    if (saved !== undefined && now.includes(saved)) return;
    if (now.length === 1) {
      save(now[0]!);
      return;
    }
    if (now.includes('chrome')) save('chrome');
  }

  async function wake(): Promise<WakeBrowserReply> {
    if (platform !== 'darwin' && platform !== 'linux' && platform !== 'win32') return { status: 'unsupported' };
    const before = await daemonStatus();
    if (before === 'connected') {
      await observe();
      return { status: 'connected' };
    }
    if (before !== 'disconnected') return { status: 'unknown' };
    const now = await running();
    const target = pickTarget(now);
    if (target === undefined) return { status: 'no-browser' };
    if (now.includes(target)) {
      if (await waitConnected(shortWaitMs)) return { status: 'connected', browser: target };
      return { status: 'browser-open', browser: target };
    }
    if (!(await launch(target))) return { status: 'launch-failed', browser: target };
    if (await waitConnected(waitMs)) {
      save(target);
      options.logger?.warn?.(`[dsh-workbench] Desktop：已打开 ${specOf(target).label}`);
      return { status: 'connected', browser: target };
    }
    return { status: 'not-connected', browser: target };
  }

  return { observe, wake };
}
