import { execFileSync, spawn } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const launcher = fileURLToPath(new URL('../../../../../bin/seed-workshop-windows.mjs', import.meta.url));
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fakeShellRoot(root: string): string {
  const shellRoot = join(root, 'shell');
  mkdirSync(join(shellRoot, 'skills', 'workbench-module-diy'), { recursive: true });
  writeFileSync(
    join(shellRoot, 'package.json'),
    JSON.stringify({
      version: '9.9.9',
      devDependencies: { '@deepseek-ai/dsh-client-ui-primitives': '1.2.3' },
    }),
    'utf8',
  );
  return shellRoot;
}

function fakePnpm(root: string, pauseMs = 0): string {
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  if (process.platform === 'win32') {
    writeFileSync(
      join(bin, 'pnpm-fake.mjs'),
      `import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (${pauseMs} > 0) await new Promise((resolve) => setTimeout(resolve, ${pauseMs}));
appendFileSync(join(process.env.DSH_HOME, 'pnpm-calls.log'), process.cwd() + '\\n');
const dir = join(process.cwd(), 'node_modules', '@dsh-workbench', 'core');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'package.json'), '{"version":"9.9.9"}');
`,
      'utf8',
    );
    writeFileSync(join(bin, 'pnpm.cmd'), '@echo off\r\nnode "%~dp0pnpm-fake.mjs" %*\r\n', 'utf8');
    return bin;
  }
  const file = join(bin, 'pnpm');
  writeFileSync(
    file,
    `#!/bin/sh\n${pauseMs > 0 ? `sleep ${pauseMs / 1000}` : ''}\nprintf "%s\\n" "$PWD" >> "$DSH_HOME/pnpm-calls.log"\nmkdir -p node_modules/@dsh-workbench/core\nprintf '{"version":"9.9.9"}' > node_modules/@dsh-workbench/core/package.json\n`,
    'utf8',
  );
  chmodSync(file, 0o755);
  return bin;
}

describe('Windows 工坊 Node seed', () => {
  it('★ full 建骨架 + 调 pnpm install + 挂指引，不依赖 bash', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-seed-win-'));
    roots.push(root);
    const shellRoot = fakeShellRoot(root);
    const bin = fakePnpm(root);

    const out = execFileSync(process.execPath, [launcher, 'full', '/unused/seed.sh'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DSH_HOME: root,
        DSH_WB_SHELL_ROOT: shellRoot,
        PATH: [bin, process.env.PATH].filter(Boolean).join(delimiter),
      },
    });

    const diy = join(root, 'workbench', 'diy');
    const manifest = JSON.parse(readFileSync(join(diy, 'package.json'), 'utf8'));
    expect(manifest.packageManager).toBe('pnpm@10.32.1');
    expect(manifest.devDependencies['@dsh-workbench/core']).toBe('^9.9.9');
    expect(manifest.devDependencies['@deepseek-ai/dsh-client-ui-primitives']).toBe('1.2.3');
    expect(existsSync(join(diy, 'pnpm-workspace.yaml'))).toBe(true);
    expect(existsSync(join(diy, '.npmrc'))).toBe(true);
    expect(existsSync(join(diy, 'packages'))).toBe(true);
    expect(out).toContain('建 DIY 工坊');

    const skillLink = join(diy, '.agents', 'skills', 'workbench-module-diy');
    expect(lstatSync(skillLink).isSymbolicLink()).toBe(true);
    expect(resolve(readlinkSync(skillLink))).toBe(resolve(join(shellRoot, 'skills', 'workbench-module-diy')));

    const calls = readFileSync(join(root, 'pnpm-calls.log'), 'utf8');
    expect(calls.trim().split('\n').map((one) => realpathSync(one))).toContain(realpathSync(diy));
    expect(JSON.parse(readFileSync(join(diy, '.sync.json'), 'utf8')).state).toBe('ok');
    expect(JSON.parse(readFileSync(join(diy, '.sync.json'), 'utf8')).version).toBe('9.9.9');
  });

  it('entry 不再建骨架，交给宿主那条 full', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-seed-win-'));
    roots.push(root);
    const shellRoot = fakeShellRoot(root);

    const out = execFileSync(process.execPath, [launcher, 'entry', '/unused/seed.sh'], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: root, DSH_WB_SHELL_ROOT: shellRoot },
    });

    expect(existsSync(join(root, 'workbench', 'diy', 'package.json'))).toBe(false);
    expect(out).toContain('等 full');
  });

  it('★ 外壳版本变了，entry 把工坊工具链对齐并重装', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-seed-win-'));
    roots.push(root);
    const shellRoot = fakeShellRoot(root);
    const bin = fakePnpm(root);
    const env = {
      ...process.env,
      DSH_HOME: root,
      DSH_WB_SHELL_ROOT: shellRoot,
      PATH: [bin, process.env.PATH].filter(Boolean).join(delimiter),
    };

    execFileSync(process.execPath, [launcher, 'full', '/unused/seed.sh'], { encoding: 'utf8', env });
    const installed = join(
      root,
      'workbench',
      'diy',
      'node_modules',
      '@dsh-workbench',
      'core',
      'package.json',
    );
    mkdirSync(dirname(installed), { recursive: true });
    writeFileSync(installed, JSON.stringify({ version: '9.9.9' }), 'utf8');
    writeFileSync(
      join(shellRoot, 'package.json'),
      JSON.stringify({ version: '10.0.0', devDependencies: {} }),
      'utf8',
    );

    const out = execFileSync(process.execPath, [launcher, 'entry', '/unused/seed.sh'], {
      encoding: 'utf8',
      env,
    });

    const manifest = JSON.parse(readFileSync(join(root, 'workbench', 'diy', 'package.json'), 'utf8'));
    expect(manifest.devDependencies['@dsh-workbench/core']).toBe('^10.0.0');
    expect(manifest.pnpm.overrides['@dsh-workbench/core']).toBe('^10.0.0');
    expect(out).toContain('对齐到 10.0.0');
    expect(JSON.parse(readFileSync(join(root, 'workbench', 'diy', '.sync.json'), 'utf8')).state).toBe('ok');
    expect(JSON.parse(readFileSync(join(root, 'workbench', 'diy', '.sync.json'), 'utf8')).version).toBe('10.0.0');
    expect(readFileSync(join(root, 'pnpm-calls.log'), 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('★ 安装期间 .sync.json 心跳持续写 syncing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-seed-win-'));
    roots.push(root);
    const shellRoot = fakeShellRoot(root);
    const bin = fakePnpm(root, 2000);
    const env = {
      ...process.env,
      DSH_HOME: root,
      DSH_WB_SHELL_ROOT: shellRoot,
      PATH: [bin, process.env.PATH].filter(Boolean).join(delimiter),
    };
    const stateFile = join(root, 'workbench', 'diy', '.sync.json');
    const child = spawn(process.execPath, [launcher, 'full', '/unused/seed.sh'], {
      env,
      stdio: 'ignore',
    });
    const readState = () => JSON.parse(readFileSync(stateFile, 'utf8'));
    const deadline = Date.now() + 3_000;
    while (!existsSync(stateFile) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const first = readState().at;
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const during = readState();
    expect(during.state).toBe('syncing');
    expect(during.at).not.toBe(first);
    await new Promise((resolve) => child.on('close', resolve));
    expect(JSON.parse(readFileSync(stateFile, 'utf8')).state).toBe('ok');
  });

  it('★ 另一个进程持锁时这一轮跳过，不并发装', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-seed-win-'));
    roots.push(root);
    const shellRoot = fakeShellRoot(root);
    const bin = fakePnpm(root);
    const env = {
      ...process.env,
      DSH_HOME: root,
      DSH_WB_SHELL_ROOT: shellRoot,
      PATH: [bin, process.env.PATH].filter(Boolean).join(delimiter),
    };

    execFileSync(process.execPath, [launcher, 'full', '/unused/seed.sh'], { encoding: 'utf8', env });
    writeFileSync(
      join(shellRoot, 'package.json'),
      JSON.stringify({ version: '10.0.0', devDependencies: {} }),
      'utf8',
    );
    const lock = join(root, 'workbench', 'diy', '.sync.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), 'utf8');

    const out = execFileSync(process.execPath, [launcher, 'entry', '/unused/seed.sh'], {
      encoding: 'utf8',
      env: { ...env, DSH_WB_SYNC_WAIT_MS: '0' },
    });

    expect(out).toContain('持锁');
    expect(readFileSync(join(root, 'pnpm-calls.log'), 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('★ 仓库副本用 link: 指进本仓，而不是装源上的版本', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-seed-win-'));
    roots.push(root);
    const repo = join(root, 'repo');
    const shellRoot = join(repo, 'packages', 'workbench');
    mkdirSync(join(shellRoot, 'skills', 'workbench-module-diy'), { recursive: true });
    mkdirSync(join(repo, 'packages', 'module-tools'), { recursive: true });
    mkdirSync(join(repo, 'packages', 'shared'), { recursive: true });
    writeFileSync(join(shellRoot, 'package.json'), JSON.stringify({ version: '9.9.9' }), 'utf8');
    const bin = fakePnpm(root);

    execFileSync(process.execPath, [launcher, 'full', '/unused/seed.sh'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        DSH_HOME: root,
        DSH_WB_SHELL_ROOT: shellRoot,
        PATH: [bin, process.env.PATH].filter(Boolean).join(delimiter),
      },
    });

    const manifest = JSON.parse(readFileSync(join(root, 'workbench', 'diy', 'package.json'), 'utf8'));
    expect(manifest.devDependencies['@dsh-workbench/core']).toBe(`link:${resolve(shellRoot)}`);
    expect(manifest.devDependencies['@dsh-workbench/module-tools']).toBe(
      `link:${resolve(join(repo, 'packages', 'module-tools'))}`,
    );
    expect(manifest.pnpm.overrides['@dsh-workbench/shared']).toBe(
      `link:${resolve(join(repo, 'packages', 'shared'))}`,
    );
  });

  it('第二次 entry 不重复装依赖', () => {
    const root = mkdtempSync(join(tmpdir(), 'wb-seed-win-'));
    roots.push(root);
    const shellRoot = fakeShellRoot(root);
    const bin = fakePnpm(root);
    const env = {
      ...process.env,
      DSH_HOME: root,
      DSH_WB_SHELL_ROOT: shellRoot,
      PATH: [bin, process.env.PATH].filter(Boolean).join(delimiter),
    };

    execFileSync(process.execPath, [launcher, 'full', '/unused/seed.sh'], { encoding: 'utf8', env });
    execFileSync(process.execPath, [launcher, 'entry', '/unused/seed.sh'], { encoding: 'utf8', env });

    const calls = readFileSync(join(root, 'pnpm-calls.log'), 'utf8');
    expect(calls.trim().split('\n')).toHaveLength(1);
  });
});
