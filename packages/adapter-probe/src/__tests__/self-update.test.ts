import dayjs from 'dayjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  desktopSelfUpdateCli,
  planSelfUpdate,
  readSelfUpdateView,
  runningVersionOf,
  recoveryCommand,
  selfUpdateCliFor,
  selfUpdatePaths,
  selfUpdateScript,
  startSelfUpdate,
  type SelfUpdateCli,
  type SelfUpdateRequest,
} from '../index.js';

const describePosix = process.platform === 'win32' ? describe.skip : describe;

const home = (): string => mkdtempSync(join(tmpdir(), 'wb-self-update-'));

const request = (over: Partial<SelfUpdateRequest> = {}): SelfUpdateRequest => ({
  dshHome: '/tmp/dsh-home',
  profile: 'workbench',
  pkg: '@dsh-workbench/core',
  from: '0.2.6',
  to: '0.2.7',
  pinned: true,
  ...over,
});

describePosix('工作台自更新：交给外面那个进程，而且一行都不摘自己', () => {
  it('★ 脚本里没有卸载 —— 自己那一行不会掉', () => {
    const script = selfUpdateScript(request(), selfUpdatePaths('/tmp/dsh-home'));

    expect(script).not.toMatch(/remove/);
    expect(script).not.toMatch(/plugin --profile \S+ remove/);
    expect(script).toContain('重启一次 dsh');
  });

  it('★ 成功判定看盘上那份的版本，不信 CLI 的退出码', () => {
    const script = selfUpdateScript(request(), selfUpdatePaths('/tmp/dsh-home'));

    expect(script).toContain('is_to() { [ "$(on_disk)" = "$TO" ]; }');
    expect(script).toContain('if install "$TO" && is_to; then');
    expect(script).toContain('node -e');
  });

  it('★ 目标版本不是钉死的（问不到 latest）→ 只要"盘上换成了别的版本"就算成', () => {
    const script = selfUpdateScript(request({ to: '', pinned: false }), selfUpdatePaths('/tmp/dsh-home'));

    expect(script).toContain("TO='latest'");
    expect(script).toContain('if install "$TO" && is_other; then');
    expect(script).toContain('dsh plugin --profile "$PROFILE" add "$PKG@$1"');
  });

  it('★ 换版没成 → 把旧版本装回去，并记 rolled-back', () => {
    const script = selfUpdateScript(request(), selfUpdatePaths('/tmp/dsh-home'));

    expect(script).toContain('if install "$FROM" && [ "$(on_disk)" = "$FROM" ]; then');
    expect(script).toContain('write_marker rolled-back "$FROM"');
  });

  it('★ 真出事时，日志里给的那条救法就是 recoveryCommand（不另写一份）', () => {
    const paths = selfUpdatePaths('/tmp/dsh-home');
    const script = selfUpdateScript(request(), paths);
    const rescue = recoveryCommand({ profile: 'workbench', pkg: '@dsh-workbench/core', version: '0.2.6' });

    expect(rescue).toBe('dsh plugin --profile workbench add @dsh-workbench/core@0.2.6');
    expect(script).toContain(rescue);
    expect(script.match(new RegExp(rescue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBe(2);
  });

  it('★ dsh 不在 PATH：一句人话 + failed，不硬装', () => {
    const script = selfUpdateScript(request(), selfUpdatePaths('/tmp/dsh-home'));

    expect(script).toContain('command -v dsh');
    expect(script).toContain('write_marker failed "$FROM"');
  });

  it('★ 现场落在 DSH_HOME 外面那一份（不随工作台被换掉而消失）', () => {
    const paths = selfUpdatePaths('/tmp/dsh-home');

    expect(paths.script).toBe('/tmp/dsh-home/workbench/self-update.sh');
    expect(paths.marker).toBe('/tmp/dsh-home/workbench/self-update.json');
    expect(paths.log).toBe('/tmp/dsh-home/workbench/self-update.log');
  });

  it('★ 起来之前先把现场写好：脚本、初始 marker（running）、然后 detached 跑', () => {
    const root = home();
    try {
      const calls: Array<{ file: string; args: readonly string[]; detached?: boolean }> = [];
      const fakeSpawn = ((file: string, args: readonly string[], options: { detached?: boolean }) => {
        calls.push({ file, args, detached: options.detached });
        return { on: () => undefined, unref: () => undefined };
      }) as unknown as typeof import('node:child_process').spawn;

      const started = startSelfUpdate(request({ dshHome: root }), () => undefined, fakeSpawn);
      const paths = selfUpdatePaths(root);

      expect(started.started).toBe(true);
      expect(readFileSync(paths.script, 'utf8')).toBe(selfUpdateScript(request({ dshHome: root }), paths));
      expect(statSync(paths.script).mode & 0o111).not.toBe(0);
      expect(JSON.parse(readFileSync(paths.marker, 'utf8'))).toMatchObject({
        pkg: '@dsh-workbench/core',
        from: '0.2.6',
        to: '0.2.7',
        state: 'running',
      });
      expect(calls).toEqual([{ file: 'bash', args: [paths.script], detached: true }]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('计划里的 marker 与脚本说的是同一件事（from/to/profile/pkg 一处都不许分家）', () => {
    const plan = planSelfUpdate(request(), dayjs('2026-10-15T12:00:00.000Z').toDate());

    expect(plan.marker).toMatchObject({
      profile: 'workbench',
      pkg: '@dsh-workbench/core',
      from: '0.2.6',
      to: '0.2.7',
      state: 'running',
      at: '2026-10-15T12:00:00.000Z',
    });
    expect(plan.script).toContain("FROM='0.2.6'");
    expect(plan.script).toContain("TO='0.2.7'");
    expect(plan.command).toEqual({ file: 'bash', args: [plan.paths.script], env: {}, log: plan.paths.log });
  });
});

const PKG = '@dsh-workbench/core';

describePosix('desktop：保留 profile 只认 Desktop 自带的那份 CLI', () => {
  const entry = join('/app', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'index.js');
  const proc = {
    execPath: '/app/Electron',
    argv: ['/app/Electron', entry],
    versions: { electron: '44.7.0' },
  };
  const cli: SelfUpdateCli = {
    file: '/app/Electron',
    args: ['--expose-internals', join(dirname(entry), 'cli.js')],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };

  it('★ Electron 的 Node 模式 + dsh-desktop-host 入口 → 拿到 app 自带的那条 CLI', () => {
    expect(desktopSelfUpdateCli(proc, () => true)).toEqual(cli);
  });

  it('不是 Electron / 不是 host 入口 / cli.js 不在 → undefined（退回 dsh）', () => {
    expect(desktopSelfUpdateCli({ ...proc, versions: {} }, () => true)).toBeUndefined();
    expect(
      desktopSelfUpdateCli({ ...proc, argv: ['/app/Electron', '/app/other.js'] }, () => true),
    ).toBeUndefined();
    expect(desktopSelfUpdateCli(proc, () => false)).toBeUndefined();
  });

  it('★ 只有 desktop profile 换 CLI；其它 profile 仍是 dsh', () => {
    expect(selfUpdateCliFor('desktop', proc, () => true)).toEqual(cli);
    expect(selfUpdateCliFor('Desktop', proc, () => true)).toEqual(cli);
    expect(selfUpdateCliFor('workbench', proc, () => true)).toEqual({ file: 'dsh', args: [], env: {} });
    expect(selfUpdateCliFor('desktop', { ...proc, versions: {} }, () => true)).toEqual({
      file: 'dsh',
      args: [],
      env: {},
    });
  });

  it('★ 脚本用 Electron + host CLI，不再去 PATH 上找 dsh', () => {
    const script = selfUpdateScript(
      request({ profile: 'desktop' }),
      selfUpdatePaths('/tmp/dsh-home'),
      cli,
    );

    expect(script).toContain("install() { env ELECTRON_RUN_AS_NODE='1' '/app/Electron' '--expose-internals'");
    expect(script).toContain("command -v '/app/Electron'");
    expect(script).not.toContain('command -v dsh');
    expect(script).toContain('找不到 Desktop 的 dsh');
    expect(script).toContain('退出并重开 Desktop');
    expect(script).not.toContain('重启一次 dsh');
  });

  it('★ 救法也不再是那条会被拒的 dsh plugin', () => {
    const rescue = recoveryCommand({
      profile: 'desktop',
      pkg: PKG,
      version: '0.3.8',
      cli,
    });

    expect(rescue).toContain("env ELECTRON_RUN_AS_NODE='1'");
    expect(rescue).toContain(`plugin --profile desktop add ${PKG}@0.3.8`);
    expect(rescue).not.toContain('dsh plugin');
  });

  it('★ plan 里的脚本与 forward 用的是同一份 CLI', () => {
    const plan = planSelfUpdate(request({ profile: 'desktop' }), dayjs('2026-10-23T00:00:00.000Z').toDate(), cli);

    expect(plan.script).toContain("'/app/Electron'");
    expect(plan.command).toEqual({ file: 'bash', args: [plan.paths.script], env: {}, log: plan.paths.log });
  });
});

const FAKE_DSH = `#!/usr/bin/env bash
set -euo pipefail
ARGS=("$@")
PROFILE='wb'
ADD=''
for i in "\${!ARGS[@]}"; do
  [ "\${ARGS[$i]}" = "--profile" ] && PROFILE="\${ARGS[$((i+1))]:-}"
  [ "\${ARGS[$i]}" = "add" ] && ADD="\${ARGS[$((i+1))]:-}"
done
VERSION="\${ADD##*@}"
echo "fake-dsh add $ADD" >>"$DSH_HOME/calls.log"
if [ -f "$DSH_HOME/fail-first" ]; then
  rm -f "$DSH_HOME/fail-first"
  echo "fake-dsh: 网络断了" >&2
  exit 1
fi
mkdir -p "$DSH_HOME/profiles/$PROFILE/node_modules/${PKG}"
printf '{"name":"${PKG}","version":"%s"}\\n' "$VERSION" >"$DSH_HOME/profiles/$PROFILE/node_modules/${PKG}/package.json"
`;

function onDisk(root: string): string {
  return JSON.parse(
    readFileSync(join(root, 'profiles', 'wb', 'node_modules', PKG, 'package.json'), 'utf8'),
  ).version as string;
}

function runScript(root: string, cli?: SelfUpdateCli): number | null {
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'dsh'), FAKE_DSH, { mode: 0o755 });
  mkdirSync(join(root, 'profiles', 'wb', 'node_modules', PKG), { recursive: true });
  writeFileSync(join(root, 'profiles', 'wb', 'node_modules', PKG, 'package.json'), '{"version":"0.2.6"}');
  const plan = planSelfUpdate(
    {
      dshHome: root,
      profile: 'wb',
      pkg: PKG,
      from: '0.2.6',
      to: '0.2.7',
      pinned: true,
    },
    new Date(),
    cli,
  );
  mkdirSync(plan.paths.dir, { recursive: true });
  writeFileSync(plan.paths.script, plan.script, { mode: 0o755 });
  const ran = spawnSync('bash', [plan.paths.script], {
    env: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}`, DSH_HOME: root },
  });
  return ran.status;
}

describePosix('真跑一遍那个脚本（假 dsh + 沙箱 profile）', () => {
  const maybe = process.platform === 'win32' ? it.skip : it;

  maybe('★ 正常：换到新版、marker=ok，而且调用记录里一条 remove 都没有', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-su-run-'));
    try {
      expect(runScript(root)).toBe(0);
      const marker = JSON.parse(readFileSync(join(root, 'workbench', 'self-update.json'), 'utf8'));

      expect(marker).toMatchObject({ state: 'ok', version: '0.2.7' });
      expect(onDisk(root)).toBe('0.2.7');
      expect(readFileSync(join(root, 'calls.log'), 'utf8')).toBe(`fake-dsh add ${PKG}@0.2.7\n`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  maybe('★ 指定外部 CLI（desktop 那种）：脚本把 add 交给它，不靠 PATH 上的 dsh', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-su-run-'));
    try {
      const fake = join(root, 'bin', 'desktop-dsh');
      mkdirSync(dirname(fake), { recursive: true });
      writeFileSync(fake, FAKE_DSH, { mode: 0o755 });

      expect(runScript(root, { file: fake, args: [], env: {} })).toBe(0);
      const marker = JSON.parse(readFileSync(join(root, 'workbench', 'self-update.json'), 'utf8'));

      expect(marker).toMatchObject({ state: 'ok', version: '0.2.7' });
      expect(onDisk(root)).toBe('0.2.7');
      expect(readFileSync(join(root, 'calls.log'), 'utf8')).toBe(`fake-dsh add ${PKG}@0.2.7\n`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  maybe('★ 第一次装就断网 → 装回旧版本、marker=rolled-back，工作台那一行没被动过', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-su-run-'));
    try {
      writeFileSync(join(root, 'fail-first'), '');
      expect(runScript(root)).toBe(0);
      const marker = JSON.parse(readFileSync(join(root, 'workbench', 'self-update.json'), 'utf8'));

      expect(marker).toMatchObject({ state: 'rolled-back', version: '0.2.6' });
      expect(onDisk(root)).toBe('0.2.6');
      expect(readFileSync(join(root, 'calls.log'), 'utf8')).toBe(
        `fake-dsh add ${PKG}@0.2.7\nfake-dsh add ${PKG}@0.2.6\n`,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  maybe('★ PATH 上没有 dsh → marker=failed，一句人话，不假装装上了', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-su-run-'));
    try {
      const plan = planSelfUpdate({
        dshHome: root,
        profile: 'wb',
        pkg: PKG,
        from: '0.2.6',
        to: '0.2.7',
        pinned: true,
      });
      mkdirSync(plan.paths.dir, { recursive: true });
      writeFileSync(plan.paths.script, plan.script, { mode: 0o755 });
      const ran = spawnSync('/bin/bash', [plan.paths.script], {
        env: { PATH: '/nonexistent', DSH_HOME: root },
      });
      const marker = JSON.parse(readFileSync(plan.paths.marker, 'utf8'));

      expect(ran.status).toBe(1);
      expect(marker.state).toBe('failed');
      expect(readFileSync(plan.paths.log, 'utf8')).toContain('PATH 上没有 dsh');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describePosix('运行中那一版：加载那一刻定住，盘上后来被换掉也不改口', () => {
  it('★ 按加载它的那份产物定位 package.json（dist/host/index.js → 包根）', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-running-'));
    try {
      mkdirSync(join(root, 'dist', 'host'), { recursive: true });
      writeFileSync(join(root, 'dist', 'host', 'index.js'), '');
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@dsh-workbench/core', version: '0.2.6' }));

      const running = runningVersionOf(pathToFileURL(join(root, 'dist', 'host', 'index.js')).href);

      expect(running).toBe('0.2.6');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('读不到 / 没有 version → undefined（界面据此不瞎说）', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-running-'));
    try {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@dsh-workbench/core' }));

      expect(runningVersionOf(pathToFileURL(join(root, 'nope', 'index.js')).href)).toBeUndefined();
      expect(runningVersionOf(pathToFileURL(join(root, 'dist', 'host', 'index.js')).href)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describePosix('自更新现场：界面要知道外面那个进程跑成什么样', () => {
  it('★ 读 marker + 日志尾最后几行（最多 4 行、800 字）', () => {
    const root = home();
    try {
      mkdirSync(join(root, 'workbench'), { recursive: true });
      const paths = selfUpdatePaths(root);
      writeFileSync(
        paths.marker,
        JSON.stringify({
          pkg: '@dsh-workbench/core',
          profile: 'workbench',
          from: '0.3.8',
          to: '0.3.10',
          pinned: true,
          state: 'failed',
          version: '0.3.8',
          at: '2026-10-23T01:00:00.000Z',
        }),
      );
      writeFileSync(paths.log, '第一行\n第二行\n第三行\n第四行\n第五行\n第六行\n');

      expect(readSelfUpdateView(root)).toEqual({
        state: 'failed',
        profile: 'workbench',
        from: '0.3.8',
        to: '0.3.10',
        version: '0.3.8',
        at: '2026-10-23T01:00:00.000Z',
        tail: '第三行 / 第四行 / 第五行 / 第六行',
      });
      expect(readSelfUpdateView(root, 'web')).toBeUndefined();
      expect(readSelfUpdateView(root, 'workbench')).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('没跑过 / marker 坏了 / 状态不认识 → undefined（不许瞎说）', () => {
    const root = home();
    try {
      expect(readSelfUpdateView(root)).toBeUndefined();
      mkdirSync(join(root, 'workbench'), { recursive: true });
      const paths = selfUpdatePaths(root);
      writeFileSync(paths.marker, '{ not json');
      expect(readSelfUpdateView(root)).toBeUndefined();
      writeFileSync(paths.marker, JSON.stringify({ state: 'vibes' }));
      expect(readSelfUpdateView(root)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
