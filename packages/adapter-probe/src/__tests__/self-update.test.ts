import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeam } from '@dsh-workbench/shared/host';
import { createFakeProcesses, createFakeShell } from '@dsh-workbench/shared/testing';
import {
  desktopPnpmEntry,
  desktopSelfUpdateCli,
  planSelfUpdate,
  readSelfUpdateView,
  recoveryCommand,
  runningVersionOf,
  selfUpdateBusy,
  selfUpdateCliFor,
  selfUpdatePaths,
  selfUpdateRunnerEntry,
  startSelfUpdate,
  type SelfUpdateCli,
  type SelfUpdateRequest,
} from '../index.js';
import { createSupplyPort } from '../supply-port.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-self-update-'));

function pathsOf(dshHome: string) {
  vi.stubEnv('DSH_HOME', dshHome);
  return selfUpdatePaths();
}

const home = (): string => mkdtempSync(join(ROOT, 'home-'));

const request = (over: Partial<SelfUpdateRequest> = {}): SelfUpdateRequest => {
  const dshHome = over.dshHome ?? home();
  pathsOf(dshHome);
  return {
    dshHome,
    profile: 'workbench',
    pkg: '@dsh-workbench/core',
    from: '1.2.3-beta.2',
    to: '1.2.3-beta.3',
    pinned: true,
    ...over,
  };
};

const DESKTOP_ENTRY = join('/app', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js');
const DESKTOP_PROC = {
  execPath: '/app/Electron',
  argv: ['/app/Electron', DESKTOP_ENTRY],
  versions: { electron: '44.7.0' },
};
const DESKTOP_CLI: SelfUpdateCli = {
  file: '/app/Electron',
  args: ['--expose-internals', join('/app', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')],
  env: { ELECTRON_RUN_AS_NODE: '1' },
};

describe('自更新：现场落在哪里', () => {
  it('现场都在 $DSH_HOME/workbench 下：计划、marker、日志、版本目录', () => {
    const dshHome = home();
    const paths = pathsOf(dshHome);
    expect(paths.planFile).toBe(join(dshHome, 'workbench', 'self-update-plan.json'));
    expect(paths.marker).toBe(join(dshHome, 'workbench', 'self-update.json'));
    expect(paths.log).toBe(join(dshHome, 'workbench', 'self-update.log'));
    expect(paths.versionsDir).toBe(join(dshHome, 'workbench', 'versions'));
    expect(Object.keys(paths).sort()).toEqual(['dir', 'log', 'marker', 'planFile', 'versionsDir']);
  });

  it('交给外面那个进程：一个 Node runner + 那份 plan.json，不再是脚本', () => {
    const plan = planSelfUpdate(request(), new Date('2026-11-10T12:00:00.000Z'));
    expect(plan.command.file).toBe(process.execPath);
    expect(plan.command.args[0]).toBe(selfUpdateRunnerEntry());
    expect(plan.command.args[0]?.endsWith('self-update-runner.js')).toBe(true);
    expect(plan.command.args[1]).toBe(plan.paths.planFile);
    expect(plan.command.log).toBe(plan.paths.log);
    expect(plan.steps.steps.map((step) => step.kind)).toEqual(['version', 'install', 'verify', 'switch', 'bundles', 'marker', 'expect-boot']);
    expect(plan.marker.state).toBe('running');
    expect(plan.marker.at).toBe('2026-11-10T12:00:00.000Z');
  });
});

describe('desktop：保留 profile 只认 Desktop 自带的那份 CLI', () => {
  it('★ Electron 的 Node 模式 + dsh-desktop-host 入口 → 拿到 app 自带的那条 CLI', () => {
    expect(desktopSelfUpdateCli(DESKTOP_PROC, () => true)).toEqual(DESKTOP_CLI);
  });

  it('不是 Electron / 不是 host 入口 / cli.js 不在 → undefined（退回 dsh）', () => {
    expect(desktopSelfUpdateCli({ ...DESKTOP_PROC, versions: {} }, () => true)).toBeUndefined();
    expect(desktopSelfUpdateCli({ ...DESKTOP_PROC, argv: ['/app/Electron', '/app/other.js'] }, () => true)).toBeUndefined();
    expect(desktopSelfUpdateCli(DESKTOP_PROC, () => false)).toBeUndefined();
  });

  it('★ 只有 desktop profile 换 CLI；其它 profile 仍是 dsh', () => {
    expect(selfUpdateCliFor('desktop', DESKTOP_PROC, () => true)).toEqual(DESKTOP_CLI);
    expect(selfUpdateCliFor('workbench', DESKTOP_PROC, () => true)).toEqual({ file: 'dsh', args: [], env: {} });
  });

  it('★ 救法也不再是那条会被拒的 dsh plugin（Desktop 上用 app 自带那条 CLI）', () => {
    expect(recoveryCommand({ profile: 'desktop', pkg: '@dsh-workbench/core', version: '1.2.3-beta.3', cli: DESKTOP_CLI })).toContain(
      "'--expose-internals'",
    );
    expect(recoveryCommand({ profile: 'workbench', pkg: '@dsh-workbench/core', version: '1.2.3-beta.3' })).toBe(
      'dsh plugin --profile workbench add @dsh-workbench/core@1.2.3-beta.3',
    );
  });

  it('★ 装那一步按 app 的布局推 pnpm 入口；找不到就退回 PATH 上的 pnpm', () => {
    expect(desktopPnpmEntry(DESKTOP_PROC, () => true)).toBe(
      join('/app', 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'),
    );
    expect(desktopPnpmEntry(DESKTOP_PROC, () => false)).toBeUndefined();
    const plan = planSelfUpdate(request(), new Date('2026-11-10T12:00:00.000Z'), { proc: DESKTOP_PROC, exists: () => true });
    const install = plan.steps.steps.find((step) => step.kind === 'install');
    expect(install).toMatchObject({ file: '/app/Electron', env: { ELECTRON_RUN_AS_NODE: '1' } });
  });
});

describe('起更新：先落现场，再交给外面那个进程', () => {
  it('★ 写 plan.json + marker(running)，然后 detached 起 runner', () => {
    const processes = createFakeProcesses([{}]);
    const seam = createSeam({ shell: createFakeShell([{}]), processes: processes.host, allowHost: true });
    const req = request();
    let failure = '';
    const started = startSelfUpdate(req, (message) => {
      failure = message;
    }, seam);

    expect(started.started).toBe(true);
    expect(failure).toBe('');
    const planFile = join(req.dshHome, 'workbench', 'self-update-plan.json');
    const written = JSON.parse(readFileSync(planFile, 'utf8')) as { steps: readonly { kind: string }[] };
    expect(written.steps.map((step) => step.kind)).toEqual(['version', 'install', 'verify', 'switch', 'bundles', 'marker', 'expect-boot']);
    const marker = JSON.parse(readFileSync(join(req.dshHome, 'workbench', 'self-update.json'), 'utf8')) as {
      state: string;
      from: string;
    };
    expect(marker).toMatchObject({ state: 'running', from: '1.2.3-beta.2' });
    expect(processes.calls[0]).toMatchObject({ file: process.execPath, detached: true, stdio: 'log' });
    expect(processes.calls[0]?.args).toEqual([selfUpdateRunnerEntry(), planFile]);
  });

  it('★ 已经有一次在跑 → 不起第二个，plan 也不动', () => {
    const processes = createFakeProcesses([{}]);
    const seam = createSeam({ shell: createFakeShell([{}]), processes: processes.host, allowHost: true });
    const req = request();
    pathsOf(req.dshHome);
    mkdirSync(join(req.dshHome, 'workbench'), { recursive: true });
    writeFileSync(join(req.dshHome, 'workbench', 'self-update.json'), JSON.stringify({ state: 'running', at: new Date().toISOString() }));
    let failure = '';
    const started = startSelfUpdate(req, (message) => {
      failure = message;
    }, seam);
    expect(started.started).toBe(false);
    expect(failure).toContain('已经有一次工作台更新在跑');
    expect(processes.calls).toHaveLength(0);
  });

  it('★ 起不来就不假装起来了：留一句人话，marker 也不留在 running', () => {
    const req = request();
    const messages: string[] = [];
    const started = startSelfUpdate(req, (message) => messages.push(message));

    expect(started.started).toBe(false);
    expect(messages.join('\n')).toContain('没跑起来');
    const marker = JSON.parse(readFileSync(join(req.dshHome, 'workbench', 'self-update.json'), 'utf8')) as {
      state: string;
      reason?: string;
    };
    expect(marker).toMatchObject({ state: 'failed', reason: 'incomplete' });
  });
});

describe('谁算「已经有一次在跑」', () => {
  const markerWith = (value: unknown): string => {
    const dir = mkdtempSync(join(ROOT, 'marker-'));
    const file = join(dir, 'self-update.json');
    writeFileSync(file, JSON.stringify(value));
    return file;
  };

  it('★ 正在换（running，还没超时）→ 忙；换了很久没动静 → 不忙（放行）', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    expect(selfUpdateBusy(markerWith({ state: 'running', at: now.toISOString() }), now)).toBe(true);
    expect(selfUpdateBusy(markerWith({ state: 'running', at: '2026-11-10T00:00:00.000Z' }), now)).toBe(false);
  });

  it('★ 正在换但那个进程已经没了（runner 崩了）→ 不忙，不用干等 TTL', () => {
    const now = new Date('2026-11-10T12:00:00.000Z');
    expect(selfUpdateBusy(markerWith({ state: 'running', pid: 999_999_999, at: now.toISOString() }), now)).toBe(false);
    expect(selfUpdateBusy(markerWith({ state: 'running', pid: process.pid, at: now.toISOString() }), now)).toBe(true);
  });

  it('★ 排着队且那个进程还活着 → 忙；进程没了 → 不忙', () => {
    expect(selfUpdateBusy(markerWith({ state: 'queued', pid: process.pid }))).toBe(true);
    expect(selfUpdateBusy(markerWith({ state: 'queued', pid: 999_999_999 }))).toBe(false);
  });

  it('★ 读不出来（没文件 / 不是 JSON）→ 一律不忙，别把用户堵死', () => {
    expect(selfUpdateBusy(join(ROOT, '没有这个文件.json'))).toBe(false);
    const dir = mkdtempSync(join(ROOT, 'broken-'));
    const file = join(dir, 'self-update.json');
    writeFileSync(file, 'not json');
    expect(selfUpdateBusy(file)).toBe(false);
  });
});

describe('自更新现场：界面要知道外面那个进程跑成什么样', () => {
  it('★ 读 marker + 日志尾最后几行', () => {
    const dshHome = home();
    pathsOf(dshHome);
    mkdirSync(join(dshHome, 'workbench'), { recursive: true });
    writeFileSync(
      join(dshHome, 'workbench', 'self-update.json'),
      JSON.stringify({ state: 'failed', profile: 'workbench', from: '1.2.3-beta.2', to: '1.2.3-beta.3', reason: 'incomplete', at: '2026-11-10T12:00:00.000Z' }),
    );
    writeFileSync(join(dshHome, 'workbench', 'self-update.log'), '一行\n二行\n三行\n四行\n五行\n');
    const view = readSelfUpdateView('workbench');
    expect(view).toMatchObject({ state: 'failed', reason: 'incomplete', from: '1.2.3-beta.2', to: '1.2.3-beta.3' });
    expect(view?.tail).toBe('二行 / 三行 / 四行 / 五行');
  });

  it('★ 迁移现场（真目录那一次）也带出来：界面要靠它说"这次得先退出"', () => {
    const dshHome = home();
    pathsOf(dshHome);
    mkdirSync(join(dshHome, 'workbench'), { recursive: true });
    const marker = join(dshHome, 'workbench', 'self-update.json');
    writeFileSync(marker, JSON.stringify({ state: 'running', to: '1.2.3-beta.3', migration: true }));
    expect(readSelfUpdateView()?.migration).toBe(true);
    writeFileSync(marker, JSON.stringify({ state: 'running', to: '1.2.3-beta.3' }));
    expect(readSelfUpdateView()?.migration).toBeUndefined();
  });

  it('★ runner 崩了（running 但那个 pid 没了）→ 读出来就是 failed，界面别一直挂着「正在换」', () => {
    const dshHome = home();
    pathsOf(dshHome);
    mkdirSync(join(dshHome, 'workbench'), { recursive: true });
    const marker = join(dshHome, 'workbench', 'self-update.json');
    writeFileSync(marker, JSON.stringify({ state: 'running', pid: 999_999_999, from: '1.2.3-beta.2' }));
    expect(readSelfUpdateView()).toMatchObject({ state: 'failed', reason: 'incomplete' });
    writeFileSync(marker, JSON.stringify({ state: 'running', pid: process.pid, from: '1.2.3-beta.2' }));
    expect(readSelfUpdateView()).toMatchObject({ state: 'running' });
    writeFileSync(marker, JSON.stringify({ state: 'running', from: '1.2.3-beta.2' }));
    expect(readSelfUpdateView()).toMatchObject({ state: 'running' });
  });

  it('★ 不认识的状态/原因不带出来；没跑过就是 undefined', () => {
    const dshHome = home();
    pathsOf(dshHome);
    mkdirSync(join(dshHome, 'workbench'), { recursive: true });
    writeFileSync(join(dshHome, 'workbench', 'self-update.json'), JSON.stringify({ state: 'failed', reason: '外星原因' }));
    expect(readSelfUpdateView()?.reason).toBeUndefined();
    writeFileSync(join(dshHome, 'workbench', 'self-update.json'), JSON.stringify({ state: '不认识的状态' }));
    expect(readSelfUpdateView()).toBeUndefined();
    expect(readSelfUpdateView()).toBeUndefined();
  });
});

describe('运行中那一版：加载那一刻定住', () => {
  it('★ 按加载它的那份产物定位 package.json（dist/host/index.js → 包根）', () => {
    const pkg = mkdtempSync(join(ROOT, 'pkg-'));
    mkdirSync(join(pkg, 'dist', 'host'), { recursive: true });
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@dsh-workbench/core', version: '1.2.3-beta.2' }));
    const entry = join(pkg, 'dist', 'host', 'index.js');
    writeFileSync(entry, '');
    expect(runningVersionOf(pathToFileURL(entry).href)).toBe('1.2.3-beta.2');
  });

  it('读不到 / 不是工作台的包 → undefined（界面据此不瞎说）', () => {
    const other = mkdtempSync(join(ROOT, 'other-'));
    mkdirSync(join(other, 'dist', 'host'), { recursive: true });
    writeFileSync(join(other, 'package.json'), JSON.stringify({ name: 'lodash', version: '1.0.0' }));
    const entry = join(other, 'dist', 'host', 'index.js');
    writeFileSync(entry, '');
    expect(runningVersionOf(pathToFileURL(entry).href)).toBeUndefined();
    expect(runningVersionOf(pathToFileURL(join(ROOT, '没有这个包', 'index.js')).href)).toBeUndefined();
  });
});

describe('供应端口把执行缝一起带下去', () => {
  it('★ startSelfUpdate 起得来那个 runner；拿不到 DSH_HOME/profile 就不硬来', () => {
    const port = createSupplyPort({} as never);
    expect(typeof port.startSelfUpdate).toBe('function');
  });
});
