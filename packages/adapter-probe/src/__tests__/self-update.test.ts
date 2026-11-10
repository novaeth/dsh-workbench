import dayjs from 'dayjs';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeam } from '@dsh-workbench/shared/host';
import { createFakeProcesses, createFakeShell } from '@dsh-workbench/shared/testing';

import {
  desktopPnpmEntry,
  desktopSelfUpdateCli,
  selfUpdateBusy,
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
import { createSupplyPort } from '../supply-port.js';

const describePosix = process.platform === 'win32' ? describe.skip : describe;

afterEach(() => {
  vi.unstubAllEnvs();
});

function pathsOf(dshHome: string) {
  vi.stubEnv('DSH_HOME', dshHome);
  return selfUpdatePaths(dshHome);
}

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
    const script = selfUpdateScript(request(), pathsOf('/tmp/dsh-home'));

    expect(script).not.toMatch(/remove/);
    expect(script).not.toMatch(/plugin --profile \S+ remove/);
    expect(script).toContain('重启一次 dsh');
  });

  it('★ 成功判定看盘上那份的版本 + 客户端产物，不信 CLI 的退出码', () => {
    const script = selfUpdateScript(request(), pathsOf('/tmp/dsh-home'));

    expect(script).toContain('if install "$TO" && verify "$WANT"; then');
    expect(script).toContain('for p in client.js dist/client/index.js dist/host/index.js; do');
    expect(script).toContain('node -e');
  });

  it('★ 目标版本不是钉死的（问不到 latest）→ 只要"盘上换成了别的版本"就算成', () => {
    const script = selfUpdateScript(request({ to: '', pinned: false }), pathsOf('/tmp/dsh-home'));

    expect(script).toContain("TO='latest'");
    expect(script).toContain('if install "$TO" && verify "$WANT"; then');
    expect(script).toContain('dsh plugin --profile "$PROFILE" add "$PKG@$1"');
  });

  it('★ 换版没成先走本地还原，联网装回只是最后一条路', () => {
    const script = selfUpdateScript(request(), pathsOf('/tmp/dsh-home'));

    expect(script).toContain('if restore && verify "$FROM"; then');
    expect(script).toContain('write_marker restored "$FROM" "$REASON"');
    expect(script).toContain('if install "$FROM" && verify "$FROM"; then');
    expect(script).toContain('write_marker rolled-back "$FROM" "$REASON"');
  });

  it('★ 装前先备份同一份发布的那几个包，失败时按清单还原', () => {
    const script = selfUpdateScript(request(), pathsOf('/tmp/dsh-home'));

    expect(script).toContain("PACKAGES=('@dsh-workbench/adapter-probe'");
    expect(script).toContain('@dsh-workbench/core');
    expect(script).toContain('cp -R "$MODULES/$p" "$BACKUP/$p"');
    expect(script).toContain('while IFS= read -r p; do');
    expect(script).toContain('MANIFEST="$BACKUP/packages.txt"');
  });

  it('★ 工坊工具链不在这一跳里：它不由 core 带进来，就不许挡更新', () => {
    const script = selfUpdateScript(request(), pathsOf('/tmp/dsh-home'));

    expect(script).not.toContain('@dsh-workbench/module-tools');
  });

  it('★ 目录被占用单独记一条，不跟普通失败混在一起', () => {
    const script = selfUpdateScript(request(), pathsOf('/tmp/dsh-home'));

    expect(script).toContain('*EPERM*|*EBUSY*|*"operation not permitted"*');
    expect(script).toContain('撞上目录被占用');
  });

  it('★ 真出事时，日志里给的那条救法就是 recoveryCommand（不另写一份）', () => {
    const paths = pathsOf('/tmp/dsh-home');
    const script = selfUpdateScript(request(), paths);
    const rescue = recoveryCommand({ profile: 'workbench', pkg: '@dsh-workbench/core', version: '0.2.6' });

    expect(rescue).toBe('dsh plugin --profile workbench add @dsh-workbench/core@0.2.6');
    expect(script).toContain(rescue);
    expect(script.match(new RegExp(rescue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))?.length).toBe(2);
  });

  it('★ dsh 不在 PATH：一句人话 + failed，不硬装', () => {
    const script = selfUpdateScript(request(), pathsOf('/tmp/dsh-home'));

    expect(script).toContain('command -v dsh');
    expect(script).toContain('write_marker failed "$FROM"');
  });

  it('★ 现场落在 DSH_HOME 外面那一份（不随工作台被换掉而消失）', () => {
    const paths = pathsOf('/tmp/dsh-home');

    expect(paths.script).toBe('/tmp/dsh-home/workbench/self-update.sh');
    expect(paths.marker).toBe('/tmp/dsh-home/workbench/self-update.json');
    expect(paths.log).toBe('/tmp/dsh-home/workbench/self-update.log');
  });

  it('★ 起来之前先把现场写好：脚本、初始 marker（running）、然后交给宿主域 spawn 跑', () => {
    const root = home();
    try {
      const processes = createFakeProcesses([{}]);
      const seam = createSeam({
        shell: createFakeShell([{}]).shell,
        runtimeRoot: '/tmp/wb-seam-test',
        allowHost: true,
        processes: processes.host,
      });

      const paths = pathsOf(root);
      const started = startSelfUpdate(request({ dshHome: root }), () => undefined, seam);

      expect(started.started).toBe(true);
      expect(readFileSync(paths.script, 'utf8')).toBe(selfUpdateScript(request({ dshHome: root }), paths));
      expect(statSync(paths.script).mode & 0o111).not.toBe(0);
      expect(JSON.parse(readFileSync(paths.marker, 'utf8'))).toMatchObject({
        pkg: '@dsh-workbench/core',
        from: '0.2.6',
        to: '0.2.7',
        state: 'running',
      });
      expect(processes.calls).toHaveLength(1);
      expect(processes.calls[0]?.file).toBe('bash');
      expect(processes.calls[0]?.args).toEqual([paths.script]);
      expect(processes.calls[0]?.logFile).toBe(paths.log);
      expect(seam.facts().filter((fact) => fact.verb === 'spawn')).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('★ 供应端口把执行缝一起带下去：startSelfUpdate 起得来那个脚本', () => {
    const root = home();
    try {
      const processes = createFakeProcesses([{}]);
      const seam = createSeam({
        shell: createFakeShell([{}]).shell,
        runtimeRoot: '/tmp/wb-seam-test',
        allowHost: true,
        processes: processes.host,
      });
      pathsOf(root);

      const started = createSupplyPort({ seam }).startSelfUpdate(request({ dshHome: root }), () =>
        undefined,
      );

      expect(started.started).toBe(true);
      expect(processes.calls).toHaveLength(1);
      expect(processes.calls[0]?.args).toEqual([started.paths.script]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('没有执行缝时自更新不假装起来了：留一句人话', () => {
    const root = home();
    try {
      pathsOf(root);
      const messages: string[] = [];

      createSupplyPort().startSelfUpdate(request({ dshHome: root }), (message) => messages.push(message));

      expect(messages[0]).toContain('自举脚本没跑起来');
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

  it('★ 已经有一次在跑（marker 还是 running 且没超时）→ 不起第二个，node_modules 一个字符都不动', () => {
    const root = home();
    try {
      const processes = createFakeProcesses([{}]);
      const seam = createSeam({
        shell: createFakeShell([{}]).shell,
        runtimeRoot: '/tmp/wb-seam-test',
        allowHost: true,
        processes: processes.host,
      });
      const paths = pathsOf(root);
      mkdirSync(paths.dir, { recursive: true });
      writeFileSync(
        paths.marker,
        JSON.stringify({ state: 'running', at: new Date().toISOString(), pkg: PKG }),
      );
      const before = readFileSync(paths.marker, 'utf8');
      const messages: string[] = [];

      const started = startSelfUpdate(request({ dshHome: root }), (message) => messages.push(message), seam);

      expect(started.started).toBe(false);
      expect(messages[0]).toContain('已经有一次工作台更新在跑');
      expect(processes.calls).toHaveLength(0);
      expect(readFileSync(paths.marker, 'utf8')).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('★ 上一把是超时留下的僵尸 marker → 不挡今天的更新', () => {
    const root = home();
    try {
      const processes = createFakeProcesses([{}]);
      const seam = createSeam({
        shell: createFakeShell([{}]).shell,
        runtimeRoot: '/tmp/wb-seam-test',
        allowHost: true,
        processes: processes.host,
      });
      const paths = pathsOf(root);
      mkdirSync(paths.dir, { recursive: true });
      writeFileSync(
        paths.marker,
        JSON.stringify({ state: 'running', at: new Date(Date.now() - 3_600_000).toISOString() }),
      );

      const started = startSelfUpdate(request({ dshHome: root }), () => undefined, seam);

      expect(started.started).toBe(true);
      expect(processes.calls).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
      pathsOf('/tmp/dsh-home'),
      cli,
    );

    expect(script).toContain("out=$(env ELECTRON_RUN_AS_NODE='1' '/app/Electron' '--expose-internals'");
    expect(script).toContain("command -v '/app/Electron'");
    expect(script).not.toContain('command -v dsh');
    expect(script).toContain('找不到 Desktop 的 dsh');
    expect(script).toContain('退出并重开 Desktop');
    expect(script).not.toContain('重启一次 dsh');
  });

  it('★ 预取那条 pnpm 入口按 app 的布局推：找不到就不预取（不许瞎猜一条命令行）', () => {
    const proc = {
      execPath: '/app/Electron',
      argv: ['/app/Electron', '/app/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'],
      versions: { electron: '44.7.0' },
    };

    expect(desktopPnpmEntry(proc, () => false)).toBeUndefined();
    expect(desktopPnpmEntry(proc, () => true)).toBe(
      '/app/resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs',
    );
    expect(desktopPnpmEntry({ ...proc, argv: ['/app/Electron', '/tmp/plain.js'] }, () => true)).toBeUndefined();
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

const ARTIFACTS = ['client.js', 'dist/client/index.js', 'dist/host/index.js'];

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
DIR="$DSH_HOME/profiles/$PROFILE/node_modules/${PKG}"
echo "fake-dsh add $ADD" >>"$DSH_HOME/calls.log"
if [ -f "$DSH_HOME/fail-first" ]; then
  rm -f "$DSH_HOME/fail-first"
  echo "fake-dsh: 网络断了" >&2
  exit 1
fi
MODE=''
if [ -f "$DSH_HOME/break" ]; then MODE="$(cat "$DSH_HOME/break")"; fi
if [ -f "$DSH_HOME/break-once" ]; then MODE="$(cat "$DSH_HOME/break-once")"; rm -f "$DSH_HOME/break-once"; fi
if [ "$MODE" = "occupied" ]; then
  echo "[ERR_PNPM_EPERM] operation not permitted, rename core_tmp -> core" >&2
  rm -rf "$DIR"
  exit 1
fi
rm -rf "$DIR"
mkdir -p "$DIR"
if [ "$MODE" != "no-package" ]; then
  printf '{"name":"${PKG}","version":"%s"}\\n' "$VERSION" >"$DIR/package.json"
  printf '' >"$DIR/client.js"
  mkdir -p "$DIR/dist/client" "$DIR/dist/host"
  printf '' >"$DIR/dist/client/index.js"
  printf '' >"$DIR/dist/host/index.js"
  if [ "$MODE" = "half" ]; then rm -rf "$DIR/dist"; fi
fi
`;

function writeTree(dir: string, version: string, artifacts: readonly string[] = ARTIFACTS): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: PKG, version }));
  for (const artifact of artifacts) {
    mkdirSync(dirname(join(dir, artifact)), { recursive: true });
    writeFileSync(join(dir, artifact), '');
  }
}

function onDisk(root: string): string {
  return JSON.parse(
    readFileSync(join(root, 'profiles', 'wb', 'node_modules', PKG, 'package.json'), 'utf8'),
  ).version as string;
}

function markerOf(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, 'workbench', 'self-update.json'), 'utf8')) as Record<string, unknown>;
}

function callsOf(root: string): string {
  try {
    return readFileSync(join(root, 'calls.log'), 'utf8');
  } catch {
    return '';
  }
}

function logOf(root: string): string {
  return readFileSync(join(root, 'workbench', 'self-update.log'), 'utf8');
}

function runScript(
  root: string,
  cli?: SelfUpdateCli,
  over: Partial<SelfUpdateRequest> = {},
  host?: { file: string; args: readonly string[]; env: Readonly<Record<string, string>> },
  prefetch?: { file: string; args: readonly string[]; env: Readonly<Record<string, string>> },
): number | null {
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'dsh'), FAKE_DSH, { mode: 0o755 });
  writeTree(join(root, 'profiles', 'wb', 'node_modules', PKG), '0.2.6');
  vi.stubEnv('DSH_HOME', root);
  const requestValue: SelfUpdateRequest = {
    dshHome: root,
    profile: 'wb',
    pkg: PKG,
    from: '0.2.6',
    to: '0.2.7',
    pinned: true,
    attempts: 1,
    retryMs: 0,
    ...over,
  };
  const plan = planSelfUpdate(requestValue, new Date(), cli);
  if (host !== undefined || prefetch !== undefined) {
    plan.script = selfUpdateScript(requestValue, plan.paths, cli, host, prefetch);
  }
  mkdirSync(plan.paths.dir, { recursive: true });
  writeFileSync(plan.paths.script, plan.script, { mode: 0o755 });
  const ran = spawnSync('bash', [plan.paths.script], {
    env: { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}`, DSH_HOME: root },
  });
  return ran.status;
}

function sandbox(name: string): string {
  return mkdtempSync(join(tmpdir(), `wb-su-${name}-`));
}

describePosix('真跑一遍那个脚本（假 dsh + 沙箱 profile）', () => {
  const maybe = process.platform === 'win32' ? it.skip : it;
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });
  const fresh = (name: string): string => {
    const root = sandbox(name);
    roots.push(root);
    return root;
  };

  maybe('★ 正常：换到新版、marker=ok，而且调用记录里一条 remove 都没有', () => {
    const root = fresh('ok');
    expect(runScript(root)).toBe(0);

    expect(markerOf(root)).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(onDisk(root)).toBe('0.2.7');
    expect(callsOf(root)).toBe(`fake-dsh add ${PKG}@0.2.7\n`);
  });

  maybe('★ 指定外部 CLI（desktop 那种）：脚本把 add 交给它，不靠 PATH 上的 dsh', () => {
    const root = fresh('cli');
    const fake = join(root, 'bin', 'desktop-dsh');
    mkdirSync(dirname(fake), { recursive: true });
    writeFileSync(fake, FAKE_DSH, { mode: 0o755 });

    expect(runScript(root, { file: fake, args: [], env: {} })).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(onDisk(root)).toBe('0.2.7');
    expect(callsOf(root)).toBe(`fake-dsh add ${PKG}@0.2.7\n`);
  });

  maybe('★ 装不上 → 用本地备份还原（没联网），marker=restored，工作台那一行没被动过', () => {
    const root = fresh('restore');
    writeFileSync(join(root, 'fail-first'), '');

    expect(runScript(root)).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'restored', version: '0.2.6' });
    expect(onDisk(root)).toBe('0.2.6');
    expect(callsOf(root)).toBe(`fake-dsh add ${PKG}@0.2.7\n`);
  });

  maybe('★ 装上但不完整（少了客户端产物）→ 一样还原，不留给 dsh 一个起不来的树', () => {
    const root = fresh('no-artifacts');
    writeFileSync(join(root, 'break'), 'no-package');

    expect(runScript(root)).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'restored', version: '0.2.6', reason: 'occupied' });
    expect(onDisk(root)).toBe('0.2.6');
    expect(callsOf(root)).toBe(`fake-dsh add ${PKG}@0.2.7\n`);
  });

  maybe('★ 目录被占用（EPERM，Windows 那种）→ 还原 + reason=occupied + 日志单记一条', () => {
    const root = fresh('occupied');
    writeFileSync(join(root, 'break'), 'occupied');

    expect(runScript(root)).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'restored', version: '0.2.6', reason: 'occupied' });
    expect(onDisk(root)).toBe('0.2.6');
    expect(logOf(root)).toContain('撞上目录被占用');
    expect(callsOf(root)).toBe(`fake-dsh add ${PKG}@0.2.7\n`);
  });

  maybe('★ 只有一半文件（dist 没了）→ 还原 + reason=incomplete（盘上读得到，就是不全）', () => {
    const root = fresh('half');
    writeFileSync(join(root, 'break'), 'half');

    expect(runScript(root)).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'restored', version: '0.2.6', reason: 'incomplete' });
    expect(onDisk(root)).toBe('0.2.6');
  });

  maybe('★ 占用是竞态：会重试几次才认输（次数由 request 定，测试不等真秒）', () => {
    const root = fresh('retry');
    writeFileSync(join(root, 'break'), 'occupied');

    expect(runScript(root, undefined, { attempts: 3 })).toBe(0);
    expect(callsOf(root)).toBe(
      `fake-dsh add ${PKG}@0.2.7\nfake-dsh add ${PKG}@0.2.7\nfake-dsh add ${PKG}@0.2.7\n`,
    );
    expect(markerOf(root)).toMatchObject({ state: 'restored', version: '0.2.6' });
  });

  maybe('★ 盘上有工坊工具链（版本跟这一跳无关）→ 不许拿它挡更新，仍记 ok', () => {
    const root = fresh('workshop');
    writeTree(join(root, 'profiles', 'wb', 'node_modules', '@dsh-workbench', 'module-tools'), '0.2.6');

    expect(runScript(root)).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'ok', version: '0.2.7' });
  });

  maybe('★ 逐包校验：兄弟包没跟着换（只换了 core）→ 也算没成，一起还原', () => {
    const root = fresh('siblings');
    writeTree(join(root, 'profiles', 'wb', 'node_modules', '@dsh-workbench', 'shared'), '0.2.6');

    expect(runScript(root)).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'restored', version: '0.2.6', reason: 'incomplete' });
    expect(
      JSON.parse(
        readFileSync(
          join(root, 'profiles', 'wb', 'node_modules', '@dsh-workbench', 'shared', 'package.json'),
          'utf8',
        ),
      ).version,
    ).toBe('0.2.6');
    expect(callsOf(root)).toBe(`fake-dsh add ${PKG}@0.2.7\n`);
  });

  maybe('★ 备份都做不成（连清单都没有）→ 才退回联网把旧版本装回去，并记 rolled-back', () => {
    const root = fresh('net-rollback');
    writeFileSync(join(root, 'break-once'), 'occupied');
    mkdirSync(join(root, 'workbench', 'backup'), { recursive: true });
    writeFileSync(join(root, 'workbench', 'backup', '0.2.6'), '');

    expect(runScript(root)).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'rolled-back', version: '0.2.6' });
    expect(onDisk(root)).toBe('0.2.6');
    expect(callsOf(root)).toBe(`fake-dsh add ${PKG}@0.2.7\nfake-dsh add ${PKG}@0.2.6\n`);
  });

  maybe('★ PATH 上没有 dsh → marker=failed，一句人话，不假装装上了', () => {
    const root = fresh('nodsh');
    vi.stubEnv('DSH_HOME', root);
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

    expect(ran.status).toBe(1);
    expect(markerOf(root).state).toBe('failed');
    expect(readFileSync(plan.paths.log, 'utf8')).toContain('PATH 上没有 dsh');
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
      const paths = pathsOf(root);
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
          reason: 'occupied',
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
        reason: 'occupied',
        tail: '第三行 / 第四行 / 第五行 / 第六行',
      });
      expect(readSelfUpdateView(root, 'web')).toBeUndefined();
      expect(readSelfUpdateView(root, 'workbench')).toBeDefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('★ restored 与不认识的原因都要老实分开：认识的原样带出，不认识的不带', () => {
    const root = home();
    try {
      mkdirSync(join(root, 'workbench'), { recursive: true });
      const paths = pathsOf(root);
      writeFileSync(paths.marker, JSON.stringify({ state: 'restored', version: '0.2.6', reason: 'incomplete' }));
      expect(readSelfUpdateView(root)).toMatchObject({ state: 'restored', reason: 'incomplete' });

      writeFileSync(paths.marker, JSON.stringify({ state: 'restored', version: '0.2.6', reason: 'vibes' }));
      expect(readSelfUpdateView(root)?.reason).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('没跑过 / marker 坏了 / 状态不认识 → undefined（不许瞎说）', () => {
    const root = home();
    try {
      pathsOf(root);
      expect(readSelfUpdateView(root)).toBeUndefined();
      mkdirSync(join(root, 'workbench'), { recursive: true });
      const paths = pathsOf(root);
      writeFileSync(paths.marker, '{ not json');
      expect(readSelfUpdateView(root)).toBeUndefined();
      writeFileSync(paths.marker, JSON.stringify({ state: 'vibes' }));
      expect(readSelfUpdateView(root)).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describePosix('换包时机：宿主还在就排队，不在才换，装好了把它拉回来', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });
  const waitFor = (file: string): boolean => {
    for (let i = 0; i < 40; i += 1) {
      if (existsSync(file)) return true;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
    return false;
  };
  const fresh = (name: string): string => {
    const root = sandbox(name);
    roots.push(root);
    return root;
  };
  const launchInto = (root: string) => ({
    file: '/bin/sh',
    args: ['-c', `printf launched >> '${join(root, 'launched.txt')}'`] as readonly string[],
    env: {},
  });
  const lockOf = (root: string): string => join(root, 'workbench', 'host.lock');
  const maybe = process.platform === 'win32' ? it.skip : it;

  maybe('★ 宿主还开着（锁在）+ 等待额度用光 → 一个字都不动，marker=queued', () => {
    const root = fresh('queued');
    mkdirSync(join(root, 'workbench'), { recursive: true });
    writeFileSync(lockOf(root), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));

    expect(runScript(root, undefined, { waitMs: 0, holdMs: 0 }, launchInto(root))).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'queued', version: '0.2.6' });
    expect(onDisk(root)).toBe('0.2.6');
    expect(callsOf(root)).toBe('');
    expect(existsSync(join(root, 'launched.txt'))).toBe(false);
  });

  maybe('★ 锁在但写锁那个进程早死了（宿主被硬杀）→ 当陈锁，不再白等', () => {
    const root = fresh('stale-lock');
    mkdirSync(join(root, 'workbench'), { recursive: true });
    const dead = spawnSync(process.execPath, ['-e', '']).pid ?? 0;
    writeFileSync(lockOf(root), JSON.stringify({ pid: dead, at: new Date().toISOString() }));

    expect(runScript(root, undefined, { waitMs: 0, holdMs: 0 }, launchInto(root))).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(onDisk(root)).toBe('0.2.7');
    expect(logOf(root)).not.toContain('宿主还没退');
  });

  maybe('★ 锁不在、宿主也没在跑 → 照常换，marker=ok，并把 Desktop 拉回来', () => {
    const root = fresh('relaunch');

    expect(runScript(root, undefined, { waitMs: 0, holdMs: 0 }, launchInto(root))).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(onDisk(root)).toBe('0.2.7');
    expect(waitFor(join(root, 'launched.txt'))).toBe(true);
  });

  maybe('★ 用户选「稍后」（relaunch=false）→ 装好了也不拉起', () => {
    const root = fresh('later');

    expect(runScript(root, undefined, { waitMs: 0, holdMs: 0, relaunch: false }, launchInto(root))).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(existsSync(join(root, 'launched.txt'))).toBe(false);
  });

  maybe('★ 没装成（已还原）→ 不许拉起 —— 别把用户弹回一个坏状态', () => {
    const root = fresh('norelaunch');
    writeFileSync(join(root, 'break'), 'occupied');

    expect(runScript(root, undefined, { waitMs: 0, holdMs: 0 }, launchInto(root))).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'restored' });
    expect(existsSync(join(root, 'launched.txt'))).toBe(false);
  });

  maybe('★ 预取先跑（在等宿主之前），跑挂了也照样换包 —— 只是慢一点', () => {
    const root = fresh('prefetch');
    const mark = join(root, 'prefetched.txt');

    expect(
      runScript(root, undefined, { waitMs: 0, holdMs: 0 }, launchInto(root), {
        file: '/bin/sh',
        args: ['-c', `printf fetched >> '${mark}'`],
        env: {},
      }),
    ).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(waitFor(mark)).toBe(true);
    expect(logOf(root)).toContain('预取好了');
  });

  maybe('★ 预取挂了（命令不存在）→ 记一句，照样把包换了', () => {
    const root = fresh('prefetch-bad');

    expect(
      runScript(root, undefined, { waitMs: 0, holdMs: 0 }, launchInto(root), {
        file: '/nonexistent/pnpm',
        args: ['store', 'add', 'x'],
        env: {},
      }),
    ).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(logOf(root)).toContain('预取没成');
  });

  maybe('★ 非 Desktop（没有拉起命令）→ 不等宿主、不排队，照旧立刻换', () => {
    const root = fresh('headless');
    mkdirSync(join(root, 'workbench'), { recursive: true });
    writeFileSync(lockOf(root), JSON.stringify({ pid: process.pid }));

    expect(runScript(root, undefined, { waitMs: 0, holdMs: 0 })).toBe(0);
    expect(markerOf(root)).toMatchObject({ state: 'ok', version: '0.2.7' });
    expect(onDisk(root)).toBe('0.2.7');
  });
});

describe('谁算「已经有一次在跑」—— 一个地方说了算，防的就是两个 pnpm 叠在一起', () => {
  const dead = (): number => spawnSync(process.execPath, ['-e', '']).pid ?? 0;

  it('★ 正在换（running，还没超时）→ 忙；换了很久没动静 → 不忙（放行）', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'wb-busy-')), 'self-update.json');
    const now = new Date('2026-11-10T08:00:00.000Z');

    writeFileSync(file, JSON.stringify({ state: 'running', at: '2026-11-10T07:59:00.000Z' }));
    expect(selfUpdateBusy(file, now)).toBe(true);

    writeFileSync(file, JSON.stringify({ state: 'running', at: '2026-11-10T06:00:00.000Z' }));
    expect(selfUpdateBusy(file, now)).toBe(false);

    rmSync(dirname(file), { recursive: true, force: true });
  });

  it('★ 排着队且脚本还活着 → 忙 —— 宿主重启时续跑那条路不许起第二个', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-busy-'));
    const file = join(dir, 'self-update.json');

    writeFileSync(file, JSON.stringify({ state: 'queued', pid: process.pid }));
    expect(selfUpdateBusy(file)).toBe(true);

    writeFileSync(file, JSON.stringify({ state: 'queued', pid: dead() }));
    expect(selfUpdateBusy(file)).toBe(false);

    writeFileSync(file, JSON.stringify({ state: 'queued' }));
    expect(selfUpdateBusy(file)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });

  it('★ 读不出来（没文件 / 不是 JSON）→ 一律不忙，别把用户堵死', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wb-busy-'));
    const file = join(dir, 'self-update.json');

    expect(selfUpdateBusy(file)).toBe(false);
    writeFileSync(file, 'not json');
    expect(selfUpdateBusy(file)).toBe(false);

    rmSync(dir, { recursive: true, force: true });
  });
});
