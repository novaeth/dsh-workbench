import dayjs from 'dayjs';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  planSelfUpdate,
  selfUpdateNodeScript,
  selfUpdatePaths,
  startSelfUpdate,
  type SelfUpdateCli,
  type SelfUpdateRequest,
} from '../index.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function pathsOf(dshHome: string, platform?: NodeJS.Platform) {
  vi.stubEnv('DSH_HOME', dshHome);
  return selfUpdatePaths(dshHome, platform);
}

const home = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'wb-self-update-win-'));
  roots.push(root);
  return root;
};

const request = (over: Partial<SelfUpdateRequest> = {}): SelfUpdateRequest => ({
  dshHome: '/tmp/dsh-home',
  profile: 'workbench',
  pkg: '@dsh-workbench/core',
  from: '0.2.6',
  to: '0.2.7',
  pinned: true,
  ...over,
});

describe('Windows 自更新（Node，不依赖 bash）', () => {
  it('★ win32 脚本落点是 .mjs，plan 用当前 node 起它', () => {
    const paths = pathsOf('/tmp/dsh-home', 'win32');
    expect(paths.script).toBe(join('/tmp/dsh-home', 'workbench', 'self-update.mjs'));

    const plan = planSelfUpdate(
      request({ dshHome: '/tmp/dsh-home' }),
      dayjs('2026-10-23T00:00:00.000Z').toDate(),
      undefined,
      'win32',
    );
    expect(plan.paths.script.endsWith('.mjs')).toBe(true);
    expect(plan.command.file).toBe(process.execPath);
    expect(plan.command.args).toEqual([plan.paths.script]);
    expect(plan.command.env.ELECTRON_RUN_AS_NODE === '1' || process.versions.electron === undefined).toBe(true);
  });

  it('★ 生成的 Node 脚本语法可执行，且不再出现 bash', () => {
    const root = home();
    const requestValue = request({ dshHome: root });
    const paths = pathsOf(root, 'win32');
    const script = selfUpdateNodeScript(requestValue, paths);
    const file = join(root, 'self-update.mjs');
    writeFileSync(file, script, 'utf8');

    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    expect(check.status, check.stderr).toBe(0);
    expect(script).not.toContain('#!/usr/bin/env bash');
    expect(script).toContain('spawnSync');
  });

  it('★ 找不到 CLI 时先写 failed，不硬装', () => {
    const root = home();
    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    const cli: SelfUpdateCli = { file: join(root, 'missing-cli'), args: [], env: {} };
    writeFileSync(
      join(root, 'self-update.mjs'),
      selfUpdateNodeScript(request({ dshHome: root }), paths, cli),
      'utf8',
    );

    const run = spawnSync(process.execPath, [join(root, 'self-update.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });
    expect(run.status).toBe(1);
    expect(JSON.parse(readFileSync(paths.marker, 'utf8')).state).toBe('failed');
    expect(readFileSync(paths.log, 'utf8')).toContain('找不到 Desktop 的 dsh');
  });

  it('★ Node 自更新真跑：换到新版、marker=ok，没有 remove', () => {
    const root = home();
    const profile = 'workbench';
    const pkg = '@dsh-workbench/core';
    const installed = join(root, 'profiles', profile, 'node_modules', '@dsh-workbench', 'core', 'package.json');
    mkdirSync(dirname(installed), { recursive: true });
    writeFileSync(installed, JSON.stringify({ version: '0.2.6' }), 'utf8');

    const fakeCli = join(root, 'fake-cli.mjs');
    writeFileSync(
      fakeCli,
      [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import { dirname, join } from 'node:path';",
        'const args = process.argv.slice(2);',
        "const profile = args[args.indexOf('--profile') + 1];",
        'const spec = args[args.length - 1];',
        "const version = spec.split('@').pop();",
        "const root = join(process.env.DSH_HOME, 'profiles', profile, 'node_modules', '@dsh-workbench', 'core');",
        "mkdirSync(join(root, 'dist', 'client'), { recursive: true });",
        "mkdirSync(join(root, 'dist', 'host'), { recursive: true });",
        "writeFileSync(join(root, 'package.json'), JSON.stringify({ version }));",
        "writeFileSync(join(root, 'client.js'), '');",
        "writeFileSync(join(root, 'dist', 'client', 'index.js'), '');",
        "writeFileSync(join(root, 'dist', 'host', 'index.js'), '');",
        '',
      ].join('\n'),
      'utf8',
    );

    const cli: SelfUpdateCli = { file: process.execPath, args: [fakeCli], env: {} };
    const requestValue = request({ dshHome: root, profile, pkg });
    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(join(root, 'self-update.mjs'), selfUpdateNodeScript(requestValue, paths, cli), 'utf8');

    const run = spawnSync(process.execPath, [join(root, 'self-update.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });
    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(installed, 'utf8')).version).toBe('0.2.7');
    expect(JSON.parse(readFileSync(paths.marker, 'utf8')).state).toBe('ok');
    expect(readFileSync(paths.log, 'utf8')).not.toMatch(/remove/);
  });
});

const describePosix = process.platform === 'win32' ? describe.skip : describe;

describe('win32 子脚本的 cmd 分支', () => {
  it('★ 静态：win32 版走 $ComSpec + /d /s /c + 逐段双引号，不再把 .cmd 直接交给 spawnSync', () => {
    const paths = pathsOf('/tmp/dsh-home', 'win32');
    const script = selfUpdateNodeScript(request({ dshHome: '/tmp/dsh-home' }), paths, undefined, 'win32');

    expect(script).toContain('const WINDOWS = true;');
    expect(script).toContain("process.env.ComSpec || 'cmd.exe'");
    expect(script).toContain("['/d', '/s', '/c',");
    expect(script).toContain('windowsVerbatimArguments: true');
    expect(script).not.toContain('spawnSync(CLI.file, [...CLI.args');
  });

  it('★ 静态：非 win32 版还走原来的 spawnSync(CLI.file, args)', () => {
    const paths = pathsOf('/tmp/dsh-home', 'linux');
    const script = selfUpdateNodeScript(request({ dshHome: '/tmp/dsh-home' }), paths, undefined, 'linux');

    expect(script).toContain('const WINDOWS = false;');
    expect(script).toContain('if (!WINDOWS) return spawnSync(CLI.file, args');
  });
});

describePosix('win32 分支真跑一次（假 ComSpec）', () => {
  it('★ 起的是 $ComSpec /d /s /c，带空格的 .cmd 整段是一个 token；装成了写 ok', () => {
    const root = home();
    const profile = 'workbench';
    const pkg = '@dsh-workbench/core';
    const installed = join(root, 'profiles', profile, 'node_modules', '@dsh-workbench', 'core', 'package.json');
    mkdirSync(dirname(installed), { recursive: true });
    writeFileSync(installed, JSON.stringify({ version: '0.2.6' }), 'utf8');

    const cliFile = join(root, 'dsh shim.cmd');
    writeFileSync(cliFile, '@echo off\r\n', 'utf8');
    const argvFile = join(root, 'comspec-argv.txt');
    const comspec = join(root, 'fake-comspec.sh');
    writeFileSync(
      comspec,
      ['#!/bin/sh', `printf '%s\\n' "$@" > "${argvFile}"`, `mkdir -p "${dirname(installed)}"`, `mkdir -p "${join(dirname(installed), 'dist', 'client')}" "${join(dirname(installed), 'dist', 'host')}"`, `printf '{"version":"0.2.7"}' > "${installed}"`, `: > "${join(dirname(installed), 'client.js')}"`, `: > "${join(dirname(installed), 'dist', 'client', 'index.js')}"`, `: > "${join(dirname(installed), 'dist', 'host', 'index.js')}"`, ''].join(
        '\n',
      ),
      'utf8',
    );
    chmodSync(comspec, 0o755);

    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(
      paths.script,
      selfUpdateNodeScript(
        request({ dshHome: root, profile, pkg, from: '0.2.6', to: '0.2.7' }),
        paths,
        { file: cliFile, args: [], env: {} },
        'win32',
      ),
      'utf8',
    );

    const run = spawnSync(process.execPath, [paths.script], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root, ComSpec: comspec },
    });

    expect(run.status, run.stderr).toBe(0);
    const argv = readFileSync(argvFile, 'utf8').split('\n').filter((one) => one !== '');
    expect(argv.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    const inner = `"${cliFile}" "plugin" "--profile" "${profile}" "add" "${pkg}@0.2.7"`;
    expect(argv[3]).toBe(`"${inner}"`);
    expect(JSON.parse(readFileSync(paths.marker, 'utf8')).state).toBe('ok');
    expect(readFileSync(paths.log, 'utf8')).toContain('换好了');
  });
});

describe('Windows 自更新的闭环：装坏了必须能自己还原（不联网）', () => {
  const CORE = '@dsh-workbench/core';
  const profile = 'workbench';
  const ARTIFACTS = ['client.js', 'dist/client/index.js', 'dist/host/index.js'];

  const FAKE_CLI = [
    "import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';",
    "import { dirname, join } from 'node:path';",
    'const args = process.argv.slice(2);',
    "const profile = args[args.indexOf('--profile') + 1];",
    'const spec = args[args.length - 1];',
    "const version = spec.split('@').pop();",
    "const root = join(process.env.DSH_HOME, 'profiles', profile, 'node_modules', '@dsh-workbench', 'core');",
    "appendFileSync(join(process.env.DSH_HOME, 'calls.log'), `cli add ${spec}\\n`);",
    "let mode = '';",
    "const breakFile = join(process.env.DSH_HOME, 'break');",
    "if (existsSync(breakFile)) mode = readFileSync(breakFile, 'utf8').trim();",
    "if (mode === 'occupied') { process.stderr.write('[ERR_PNPM_EPERM] operation not permitted, rename core_tmp -> core\\n'); rmSync(root, { recursive: true, force: true }); process.exit(1); }",
    'rmSync(root, { recursive: true, force: true });',
    'mkdirSync(root, { recursive: true });',
    "if (mode !== 'no-package') {",
    "  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@dsh-workbench/core', version }));",
    "  writeFileSync(join(root, 'client.js'), '');",
    "  mkdirSync(join(root, 'dist', 'client'), { recursive: true });",
    "  mkdirSync(join(root, 'dist', 'host'), { recursive: true });",
    "  writeFileSync(join(root, 'dist', 'client', 'index.js'), '');",
    "  writeFileSync(join(root, 'dist', 'host', 'index.js'), '');",
    "  if (mode === 'half') rmSync(join(root, 'dist'), { recursive: true, force: true });",
    '}',
    '',
  ].join('\n');

  function treeOf(root: string, version: string, artifacts: readonly string[] = ARTIFACTS): void {
    const dir = join(root, 'profiles', profile, 'node_modules', '@dsh-workbench', 'core');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, 'dist', 'client'), { recursive: true });
    mkdirSync(join(dir, 'dist', 'host'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: CORE, version }));
    for (const artifact of artifacts) writeFileSync(join(dir, artifact), '');
  }

  function runClosedLoop(
    mode: string,
    host?: { file: string; args: readonly string[]; env: Readonly<Record<string, string>> },
    over: Partial<SelfUpdateRequest> = {},
    prefetch?: { file: string; args: readonly string[]; env: Readonly<Record<string, string>> },
  ): {
    root: string;
    status: number | null;
    marker: Record<string, unknown>;
    log: string;
  } {
    const root = home();
    const cliFile = join(root, 'fake-cli.mjs');
    writeFileSync(cliFile, FAKE_CLI, 'utf8');
    writeFileSync(join(root, 'break'), mode, 'utf8');
    treeOf(root, '0.2.6');
    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(
      paths.script,
      selfUpdateNodeScript(
        request({ dshHome: root, profile, pkg: CORE, attempts: 1, retryMs: 0, ...over }),
        paths,
        { file: process.execPath, args: [cliFile], env: {} },
        process.platform,
        host,
        prefetch,
      ),
      'utf8',
    );
    const run = spawnSync(process.execPath, [paths.script], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });
    return {
      root,
      status: run.status,
      marker: JSON.parse(readFileSync(paths.marker, 'utf8')) as Record<string, unknown>,
      log: readFileSync(paths.log, 'utf8'),
    };
  }

  function versionOnDisk(root: string): string {
    return (
      JSON.parse(
        readFileSync(
          join(root, 'profiles', profile, 'node_modules', '@dsh-workbench', 'core', 'package.json'),
          'utf8',
        ),
      ) as { version: string }
    ).version;
  }

  it('★ 客户端产物装没了（package.json 都没了）→ 本地还原，marker=restored，不再多调一次 CLI', () => {
    const { root, status, marker } = runClosedLoop('no-package');

    expect(status).toBe(0);
    expect(marker).toMatchObject({ state: 'restored', version: '0.2.6', reason: 'occupied' });
    expect(versionOnDisk(root)).toBe('0.2.6');
    expect(readFileSync(join(root, 'calls.log'), 'utf8')).toBe(`cli add ${CORE}@0.2.7\n`);
  });

  it('★ 目录被占用（EPERM，Windows 那种）→ 还原 + reason=occupied + 日志单记一条', () => {
    const { root, status, marker, log } = runClosedLoop('occupied');

    expect(status).toBe(0);
    expect(marker).toMatchObject({ state: 'restored', version: '0.2.6', reason: 'occupied' });
    expect(versionOnDisk(root)).toBe('0.2.6');
    expect(log).toContain('撞上目录被占用');
    expect(readFileSync(join(root, 'calls.log'), 'utf8')).toBe(`cli add ${CORE}@0.2.7\n`);
  });

  it('★ 只剩一半文件（dist 没了）→ 还原 + reason=incomplete（盘上读得到，就是不全）', () => {
    const { root, status, marker } = runClosedLoop('half');

    expect(status).toBe(0);
    expect(marker).toMatchObject({ state: 'restored', version: '0.2.6', reason: 'incomplete' });
    expect(versionOnDisk(root)).toBe('0.2.6');
  });

  it('★ 装好了（完整树）→ ok，不还原', () => {
    const root = home();
    const cliFile = join(root, 'fake-cli.mjs');
    writeFileSync(cliFile, FAKE_CLI, 'utf8');
    writeFileSync(join(root, 'break'), '', 'utf8');
    treeOf(root, '0.2.6');
    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(
      paths.script,
      selfUpdateNodeScript(
        request({ dshHome: root, profile, pkg: CORE, attempts: 1, retryMs: 0 }),
        paths,
        { file: process.execPath, args: [cliFile], env: {} },
      ),
      'utf8',
    );
    const run = spawnSync(process.execPath, [paths.script], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });

    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(paths.marker, 'utf8'))).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(versionOnDisk(root)).toBe('0.2.7');
  });

  it('★ 已经有一次在跑（marker 还是 running 且没超时）→ 不起第二个', () => {
    const root = home();
    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(
      paths.marker,
      JSON.stringify({ state: 'running', at: new Date().toISOString(), pkg: CORE }),
      'utf8',
    );
    const before = readFileSync(paths.marker, 'utf8');
    const messages: string[] = [];

    const started = startSelfUpdate(request({ dshHome: root, profile, pkg: CORE }), (message) =>
      messages.push(message),
    );

    expect(started.started).toBe(false);
    expect(messages[0]).toContain('已经有一次工作台更新在跑');
    expect(readFileSync(paths.marker, 'utf8')).toBe(before);
  });

  it('★ 宿主锁还在 + 等待额度用光 → 一个字都不动、marker=queued、不去调 CLI', () => {
    const root = home();
    const cliFile = join(root, 'fake-cli.mjs');
    writeFileSync(cliFile, FAKE_CLI, 'utf8');
    treeOf(root, '0.2.6');
    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.hostLock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8');
    writeFileSync(
      paths.script,
      selfUpdateNodeScript(
        request({ dshHome: root, profile, pkg: CORE, attempts: 1, retryMs: 0, waitMs: 0, holdMs: 0 }),
        paths,
        { file: process.execPath, args: [cliFile], env: {} },
        process.platform,
        { file: process.execPath, args: ['-e', ''], env: {} },
      ),
      'utf8',
    );

    const run = spawnSync(process.execPath, [paths.script], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });

    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(paths.marker, 'utf8'))).toMatchObject({ state: 'queued' });
    expect(versionOnDisk(root)).toBe('0.2.6');
    expect(existsSync(join(root, 'calls.log'))).toBe(false);
  });

  it('★ 装好了 → 拉起宿主那条命令真被调用（后台，不挡收尾）', () => {
    const root = home();
    const cliFile = join(root, 'fake-cli.mjs');
    writeFileSync(cliFile, FAKE_CLI, 'utf8');
    writeFileSync(join(root, 'break'), '', 'utf8');
    treeOf(root, '0.2.6');
    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    const launched = join(root, 'launched.txt');
    writeFileSync(
      paths.script,
      selfUpdateNodeScript(
        request({ dshHome: root, profile, pkg: CORE, attempts: 1, retryMs: 0, waitMs: 0, holdMs: 0 }),
        paths,
        { file: process.execPath, args: [cliFile], env: {} },
        process.platform,
        {
          file: process.execPath,
          args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(launched)}, 'x')`],
          env: {},
        },
      ),
      'utf8',
    );

    const run = spawnSync(process.execPath, [paths.script], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });

    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(paths.marker, 'utf8'))).toMatchObject({ state: 'ok' });
    for (let i = 0; i < 40 && !existsSync(launched); i += 1) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
    expect(existsSync(launched)).toBe(true);
  });

  it('★ 预取先跑（在等宿主之前），跑挂了也照样换 —— Windows 这一份也要钉住', () => {
    const root = home();
    const cliFile = join(root, 'fake-cli.mjs');
    writeFileSync(cliFile, FAKE_CLI, 'utf8');
    writeFileSync(join(root, 'break'), '', 'utf8');
    treeOf(root, '0.2.6');
    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    const fetched = join(root, 'prefetched.txt');
    writeFileSync(
      paths.script,
      selfUpdateNodeScript(
        request({ dshHome: root, profile, pkg: CORE, attempts: 1, retryMs: 0, waitMs: 0, holdMs: 0 }),
        paths,
        { file: process.execPath, args: [cliFile], env: {} },
        process.platform,
        { file: process.execPath, args: ['-e', ''], env: {} },
        {
          file: process.execPath,
          args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(fetched)}, 'x')`],
          env: {},
        },
      ),
      'utf8',
    );

    const run = spawnSync(process.execPath, [paths.script], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });

    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(paths.marker, 'utf8'))).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(existsSync(fetched)).toBe(true);
    expect(readFileSync(paths.log, 'utf8')).toContain('预取好了');
  });

  it('★ 预取挂了（命令不存在）→ 记一句，包照样换', () => {
    const root = home();
    const cliFile = join(root, 'fake-cli.mjs');
    writeFileSync(cliFile, FAKE_CLI, 'utf8');
    writeFileSync(join(root, 'break'), '', 'utf8');
    treeOf(root, '0.2.6');
    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(
      paths.script,
      selfUpdateNodeScript(
        request({ dshHome: root, profile, pkg: CORE, attempts: 1, retryMs: 0, waitMs: 0, holdMs: 0 }),
        paths,
        { file: process.execPath, args: [cliFile], env: {} },
        process.platform,
        { file: process.execPath, args: ['-e', ''], env: {} },
        { file: join(root, 'no-such-pnpm.mjs'), args: ['store', 'add', 'x'], env: {} },
      ),
      'utf8',
    );

    const run = spawnSync(process.execPath, [paths.script], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });

    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(paths.marker, 'utf8'))).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(versionOnDisk(root)).toBe('0.2.7');
    expect(readFileSync(paths.log, 'utf8')).toContain('预取没成');
  });

  it('★ 锁在但写锁那个进程早死了（宿主被硬杀）→ 当陈锁，照样换', () => {
    const root = home();
    const cliFile = join(root, 'fake-cli.mjs');
    writeFileSync(cliFile, FAKE_CLI, 'utf8');
    writeFileSync(join(root, 'break'), '', 'utf8');
    treeOf(root, '0.2.6');
    const paths = pathsOf(root, 'win32');
    mkdirSync(paths.dir, { recursive: true });
    const dead = spawnSync(process.execPath, ['-e', '']).pid ?? 0;
    writeFileSync(paths.hostLock, JSON.stringify({ pid: dead, at: new Date().toISOString() }), 'utf8');
    writeFileSync(
      paths.script,
      selfUpdateNodeScript(
        request({ dshHome: root, profile, pkg: CORE, attempts: 1, retryMs: 0, waitMs: 0, holdMs: 0 }),
        paths,
        { file: process.execPath, args: [cliFile], env: {} },
        process.platform,
        { file: process.execPath, args: ['-e', ''], env: {} },
      ),
      'utf8',
    );

    const run = spawnSync(process.execPath, [paths.script], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root },
    });

    expect(run.status, run.stderr).toBe(0);
    expect(JSON.parse(readFileSync(paths.marker, 'utf8'))).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(versionOnDisk(root)).toBe('0.2.7');
  });

  it('★ marker 里带上脚本自己的 pid —— 宿主重启时才判得出"还排着队"是不是真有人在等', () => {
    const { root, status, marker } = runClosedLoop('');

    expect(status).toBe(0);
    expect(marker).toMatchObject({ state: 'ok' });
    expect(typeof JSON.parse(readFileSync(join(root, 'workbench', 'self-update.json'), 'utf8')).pid).toBe('number');
  });
});
