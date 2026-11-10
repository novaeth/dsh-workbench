import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createFakeProcesses } from '@dsh-workbench/shared/testing';
import type { ProcessSpawnOptions } from '@dsh-workbench/shared/host';
import type { SelfUpdateRequest } from '@dsh-workbench/shared/host';
import type { SelfUpdatePaths } from '@dsh-workbench/shared/host';
import { selfUpdateStepsOf } from '../self-update-steps.js';
import { runSelfUpdateSteps } from '../self-update-run.js';
import { versionDirOf } from '../version-dir.js';
import { isManagedLinkSpec, type VersionLink } from '../version-dir.js';

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-wb-self-update-steps-'));
const FROM = '1.2.3-beta.2';
const TO = '1.2.3-beta.3';
const CORE = '@dsh-workbench/core';
const ARTIFACTS = ['client.js', 'dist/client/index.js', 'dist/host/index.js'];

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true });
});

function caseDirs(): { request: SelfUpdateRequest; paths: SelfUpdatePaths } {
  const home = mkdtempSync(join(ROOT, 'home-'));
  const profileDir = join(home, 'profiles', 'desktop');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'dsh-profile-desktop',
        private: true,
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', CORE] } },
        dependencies: { [CORE]: FROM },
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  const dir = join(home, 'workbench');
  return {
    request: { dshHome: home, profile: 'desktop', pkg: CORE, from: FROM, to: TO, pinned: true },
    paths: {
      dir,
      planFile: join(dir, 'self-update-plan.json'),
      marker: join(dir, 'self-update.json'),
      log: join(dir, 'self-update.log'),
      versionsDir: join(dir, 'versions'),
    },
  };
}

function planOf(
  request: SelfUpdateRequest,
  paths: SelfUpdatePaths,
  over: Partial<Parameters<typeof selfUpdateStepsOf>[2]> = {},
) {
  return selfUpdateStepsOf(request, paths, { bootWindowMs: 0, bootGraceMs: 0, bootPollMs: 0, ...over });
}

function materialize(input: { versionsDir: string; version: string; packages: readonly string[] }): void {
  const dir = join(input.versionsDir, input.version);
  for (const pkg of input.packages) {
    const pkgDir = join(dir, 'node_modules', pkg);
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: pkg, version: input.version }), 'utf8');
  }
  for (const artifact of ARTIFACTS) {
    const file = join(dir, 'node_modules', CORE, artifact);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, input.version, 'utf8');
  }
}

function installing(
  packages: readonly string[],
  versionsDir: string,
  version: string,
  reply: { exitCode?: number | null; stdout?: string; stderr?: string } = {},
) {
  return createFakeProcesses((call: ProcessSpawnOptions) => {
    if (call.args.includes('install')) materialize({ versionsDir, version, packages });
    return { stdout: reply.stdout ?? '+ 工作台 7 个包', ...reply };
  });
}

describe('自更新：编排是一份有序步骤（不是脚本）', () => {
  it('步骤顺序固定，且没有"等宿主"这类步', () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths, { at: '2026-11-10T12:00:00.000Z' });
    expect(plan.steps.map((step) => step.kind)).toEqual(['version', 'install', 'verify', 'switch', 'bundles', 'marker', 'expect-boot']);
    expect(plan.marker).toMatchObject({ state: 'running', from: FROM, to: TO, at: '2026-11-10T12:00:00.000Z' });
    const text = JSON.stringify(plan.steps);
    expect(text).not.toContain('host.lock');
    expect(text).not.toContain('relaunch');
    expect(text).not.toContain('backup');
    expect(plan.versionDir).toBe(join(paths.versionsDir, TO));
  });

  it('切换那一步：七个包都是自己管的 link:，包名与版本目录对得上', () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths);
    const step = plan.steps.find((item) => item.kind === 'switch');
    const links = (step as { links: readonly VersionLink[] }).links;
    expect(links).toHaveLength(7);
    for (const link of links) {
      expect(link.target).toBe(join(plan.versionDir, 'node_modules', link.pkg));
      expect(link.link).toBe(join(plan.profileDir, 'node_modules', link.pkg));
      expect(isManagedLinkSpec(link.spec, plan.versionsDir, plan.profileDir)).toBe(true);
    }
  });

  it('同一份编排跑三平台：步骤一样，只有装那一步的命令与 env 不同', () => {
    const { request, paths } = caseDirs();
    const posix = selfUpdateStepsOf(request, paths, {
      proc: { execPath: '/usr/bin/node', argv: ['/usr/bin/node', '/app/bin/dsh.js'], versions: { node: '24.0.0' } },
      exists: () => false,
    });
    const desktop = selfUpdateStepsOf(request, paths, {
      proc: {
        execPath: '/app/Electron',
        argv: ['/app/Electron', '/app/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'],
        versions: { electron: '44.7.0' },
      },
      exists: () => true,
    });
    expect(posix.steps.map((step) => step.kind)).toEqual(desktop.steps.map((step) => step.kind));
    const posixInstall = posix.steps.find((step) => step.kind === 'install');
    const desktopInstall = desktop.steps.find((step) => step.kind === 'install');
    expect(posixInstall).toMatchObject({ file: 'pnpm', args: ['install', '--dir', posix.versionDir], env: {} });
    expect(desktopInstall).toMatchObject({
      file: '/app/Electron',
      args: [join('/app', 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'), 'install', '--dir', desktop.versionDir],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
  });
});

describe('自更新：runner 按步骤跑，失败只落在 marker 上', () => {
  it('一路跑通：marker 落 ok，链接与依赖都指到新版', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths, { at: '2026-11-10T12:00:00.000Z' });
    const processes = installing(plan.packages, paths.versionsDir, TO);
    const result = await runSelfUpdateSteps(plan, { processes: processes.host, now: () => '2026-11-10T12:01:00.000Z' });
    expect(result.ok).toBe(true);
    expect(result.state).toBe('pending');
    expect(result.ran).toEqual(['version', 'install', 'verify', 'switch', 'bundles', 'marker', 'expect-boot']);
    expect(processes.calls).toHaveLength(1);
    expect(processes.calls[0]?.args).toContain('install');

    const link = join(plan.profileDir, 'node_modules', CORE);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(join(link, 'package.json'), 'utf8')).version).toBe(TO);
    const manifest = JSON.parse(readFileSync(join(plan.profileDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      dsh: { profile: { bundles: readonly string[] } };
    };
    expect(manifest.dependencies[CORE]?.replaceAll('\\', '/')).toBe(
      `link:../../workbench/versions/${TO}/node_modules/${CORE}`,
    );
    expect(manifest.dsh.profile.bundles).toContain(CORE);
    expect(JSON.parse(readFileSync(plan.markerPath, 'utf8'))).toMatchObject({ state: 'pending-restart', version: TO });
  });

  it('装失败：marker 落 failed，后面的步一步都不跑（没换链接）', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths);
    const processes = createFakeProcesses([{ exitCode: 1, stderr: 'ERR_PNPM_EPERM rename failed' }]);
    const result = await runSelfUpdateSteps(plan, { processes: processes.host, now: () => '2026-11-10T12:02:00.000Z' });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('failed');
    expect(result.ran).toEqual(['version']);
    expect(result.detail).toContain('ERR_PNPM_EPERM');
    expect(existsSync(join(plan.profileDir, 'node_modules', CORE))).toBe(false);
    expect(JSON.parse(readFileSync(plan.markerPath, 'utf8'))).toMatchObject({
      state: 'failed',
      version: FROM,
      reason: 'incomplete',
    });
  });

  it('装成功但自检没过：停在 verify，不换链接', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths);
    const processes = createFakeProcesses([{ stdout: '+ 装完了' }]);
    const result = await runSelfUpdateSteps(plan, { processes: processes.host });
    expect(result.ok).toBe(false);
    expect(result.ran).toEqual(['version', 'install']);
    expect(result.detail).toContain('自检没过');
    expect(existsSync(join(plan.profileDir, 'node_modules', CORE))).toBe(false);
  });

  it('切换那一步抛了：也变成 failed，不冒出未处理的异常', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths);
    rmSync(join(plan.profileDir, 'package.json'));
    const processes = installing(plan.packages, paths.versionsDir, TO);
    const result = await runSelfUpdateSteps(plan, { processes: processes.host });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('failed');
    expect(result.ran).toEqual(['version', 'install', 'verify']);
    expect(result.detail).toContain('switch 这一步抛了');
    expect(JSON.parse(readFileSync(plan.markerPath, 'utf8')).state).toBe('failed');
  });
});

describe('清单不变量：dsh.profile.bundles 那一行更新前后都在', () => {
  const bundlesOf = (profileDir: string): readonly string[] => {
    const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dsh: { profile: { bundles: readonly string[] } };
    };
    return manifest.dsh.profile.bundles;
  };

  const strip = (profileDir: string): void => {
    const path = join(profileDir, 'package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as { dsh: { profile: { bundles: readonly string[] } } };
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((name) => name !== CORE);
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  };

  it('★ 计划里那一步排在翻链之后，还带着一条能照抄的救法', () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths);
    expect(plan.bundle).toBe(CORE);
    expect(plan.rescue).toContain('plugin --profile desktop add @dsh-workbench/core@1.2.3-beta.3');
    expect(plan.steps.indexOf(plan.steps.find((step) => step.kind === 'bundles')!)).toBeGreaterThan(
      plan.steps.indexOf(plan.steps.find((step) => step.kind === 'switch')!),
    );
  });

  it('★ 手工把那一行摘掉 → 同一步补回（判据 2）', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths);
    strip(plan.profileDir);
    expect(bundlesOf(plan.profileDir)).not.toContain(CORE);

    const lines: string[] = [];
    const processes = installing(plan.packages, paths.versionsDir, TO);
    const result = await runSelfUpdateSteps(plan, { processes: processes.host, log: (line) => lines.push(line) });

    expect(result.ok).toBe(true);
    expect(bundlesOf(plan.profileDir)).toContain(CORE);
    expect(lines.join('\n')).toContain('已经补回');
  });

  it('★ 更新失败之后那一行仍在：失败路径自己复核一遍（判据 4）', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths);
    strip(plan.profileDir);
    const lines: string[] = [];
    const processes = createFakeProcesses([{ exitCode: 1, stderr: 'ERR_PNPM_EPERM' }]);
    const result = await runSelfUpdateSteps(plan, { processes: processes.host, log: (line) => lines.push(line) });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('已补回');
    expect(bundlesOf(plan.profileDir)).toContain(CORE);
    expect(lines.join('\n')).toContain(`救法：${plan.rescue}`);
    expect(JSON.parse(readFileSync(plan.markerPath, 'utf8')).state).toBe('failed');
  });

  it('★ 补不回时不留半成品：说清原因 + 给那条能照抄的救法（判据 3）', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths);
    const path = join(plan.profileDir, 'package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> & {
      dsh: { profile: { bundles: readonly string[] } };
    };
    delete (manifest as { dependencies?: unknown }).dependencies;
    manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((name) => name !== CORE);
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const lines: string[] = [];
    const processes = createFakeProcesses([{ exitCode: 1, stderr: 'ERR_PNPM_EPERM' }]);
    const result = await runSelfUpdateSteps(plan, { processes: processes.host, log: (line) => lines.push(line) });

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('没能确认');
    expect(lines.join('\n')).toContain(`救法：${plan.rescue}`);
    expect(bundlesOf(plan.profileDir)).not.toContain(CORE);
  });
});

describe('自动回退窗口：新版起不来就翻回上一版', () => {
  const AT = '2026-11-10T12:00:00.000Z';
  const FRESH = '2026-11-10T12:01:00.000Z';

  const bootOf = (plan: ReturnType<typeof planOf>) => {
    const step = plan.steps.find((item) => item.kind === 'expect-boot');
    return (
      step as {
        boot: {
          readonly file: string;
          readonly upFile: string;
          readonly target: string;
          readonly rollback: { readonly links: readonly { readonly link: string; readonly target: string }[] };
        };
      }
    ).boot;
  };

  const write = (file: string, version: string, at: string): void => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify({ version, at })}\n`, 'utf8');
  };

  const linkedVersion = (profileDir: string): string =>
    JSON.parse(readFileSync(join(profileDir, 'node_modules', CORE, 'package.json'), 'utf8')).version as string;

  it('★ 新版起来了、客户端也确认了 → marker 落 ok，链接不回退（判据 4）', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths, { at: AT });
    const boot = bootOf(plan);
    const processes = installing(plan.packages, paths.versionsDir, TO);
    write(boot.file, TO, FRESH);
    write(boot.upFile, TO, FRESH);

    const result = await runSelfUpdateSteps(plan, { processes: processes.host, now: () => FRESH });

    expect(result.state).toBe('ok');
    expect(JSON.parse(readFileSync(plan.markerPath, 'utf8'))).toMatchObject({ state: 'ok', version: TO });
    expect(linkedVersion(plan.profileDir)).toBe(TO);
  });

  it('★ 重启起来的是旧版 → 翻回上一版、marker 落 rolled-back，且一个进程都不再起（判据 3、5）', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths, { at: AT });
    const boot = bootOf(plan);
    const processes = installing(plan.packages, paths.versionsDir, TO);
    materialize({ versionsDir: paths.versionsDir, version: FROM, packages: plan.packages });
    write(boot.file, FROM, FRESH);

    const result = await runSelfUpdateSteps(plan, { processes: processes.host, now: () => FRESH });

    expect(result.state).toBe('rolled-back');
    expect(result.detail).toContain('旧版');
    expect(JSON.parse(readFileSync(plan.markerPath, 'utf8'))).toMatchObject({
      state: 'rolled-back',
      version: FROM,
      reason: 'boot-failed',
    });
    expect(linkedVersion(plan.profileDir)).toBe(FROM);
    const previousDir = versionDirOf(paths.versionsDir, FROM);
    expect(boot.rollback.links.length).toBeGreaterThan(0);
    for (const one of boot.rollback.links) expect(one.target.startsWith(previousDir)).toBe(true);
    expect(processes.calls).toHaveLength(1);
    expect(readFileSync(join(plan.profileDir, 'package.json'), 'utf8').replaceAll('\\', '/')).toContain(
      `/versions/${FROM}/`,
    );
  });

  it('★ 新版起来了但工作台那半没露面（过了宽限）→ 也翻回去（判据 3）', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths, { at: AT, bootGraceMs: 0 });
    const boot = bootOf(plan);
    const processes = installing(plan.packages, paths.versionsDir, TO);
    materialize({ versionsDir: paths.versionsDir, version: FROM, packages: plan.packages });
    write(boot.file, TO, FRESH);

    const result = await runSelfUpdateSteps(plan, { processes: processes.host, now: () => FRESH });

    expect(result.state).toBe('rolled-back');
    expect(result.detail).toContain('没露面');
    expect(linkedVersion(plan.profileDir)).toBe(FROM);
  });

  it('★ 还没重启过（窗口内没有新记录）→ 不判失败、不回头，marker 留在 pending-restart', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths, { at: AT });
    const processes = installing(plan.packages, paths.versionsDir, TO);

    const result = await runSelfUpdateSteps(plan, { processes: processes.host, now: () => FRESH });

    expect(result.state).toBe('pending');
    expect(JSON.parse(readFileSync(plan.markerPath, 'utf8'))).toMatchObject({ state: 'pending-restart', version: TO });
    expect(linkedVersion(plan.profileDir)).toBe(TO);
    expect(processes.calls).toHaveLength(1);
  });
});

describe('换上这一版时目录还被占着（真目录那一次）：等它退出，别硬来', () => {
  const AT = '2026-11-10T12:00:00.000Z';

  const clock = (start: string) => {
    let at = Date.parse(start);
    return {
      now: () => new Date(at).toISOString(),
      advance: (ms: number) => {
        at += ms;
      },
    };
  };

  const permissionError = (): Error => Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });

  it('★ 前两次说"占着"，第三次成了 → 照常换上（并说清是等出来的）', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths, { at: AT });
    const processes = installing(plan.packages, paths.versionsDir, TO);
    const time = clock(AT);
    const calls: number[] = [];
    let attempts = 0;
    const flip = () => {
      attempts += 1;
      calls.push(attempts);
      if (attempts <= 2) throw permissionError();
    };

    const lines: string[] = [];
    const result = await runSelfUpdateSteps(plan, {
      processes: processes.host,
      now: time.now,
      sleep: async (ms) => time.advance(ms),
      flip,
      inUseWaitMs: 60_000,
      inUsePollMs: 2_000,
      log: (line) => lines.push(line),
    });

    expect(result.state).toBe('pending');
    expect(calls).toHaveLength(3);
    expect(result.ran).toContain('switch');
    expect(lines.join('\n')).toContain('等你退出后换上');
  });

  it('★ 一直没退出（等到窗口尽头）→ 落 failed，并给一条能照抄的救法', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths, { at: AT });
    const processes = installing(plan.packages, paths.versionsDir, TO);
    const time = clock(AT);

    const result = await runSelfUpdateSteps(plan, {
      processes: processes.host,
      now: time.now,
      sleep: async (ms) => time.advance(ms),
      flip: () => {
        throw permissionError();
      },
      inUseWaitMs: 10_000,
      inUsePollMs: 2_000,
    });

    expect(result.state).toBe('failed');
    expect(result.detail).toContain('先退出');
    expect(JSON.parse(readFileSync(plan.markerPath, 'utf8'))).toMatchObject({ state: 'failed', reason: 'incomplete' });
  });

  it('不是"占着"那种错（比如路径没了）→ 不等，当场报', async () => {
    const { request, paths } = caseDirs();
    const plan = planOf(request, paths, { at: AT });
    const processes = installing(plan.packages, paths.versionsDir, TO);
    const time = clock(AT);
    let attempts = 0;

    const result = await runSelfUpdateSteps(plan, {
      processes: processes.host,
      now: time.now,
      sleep: async (ms) => time.advance(ms),
      flip: () => {
        attempts += 1;
        throw Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });
      },
    });

    expect(attempts).toBe(1);
    expect(result.state).toBe('failed');
    expect(result.detail).toContain('翻链没成');
  });
});
