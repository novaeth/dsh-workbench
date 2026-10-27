#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import which from 'which';
import writeFileAtomic from 'write-file-atomic';

const mode = process.argv[2] === 'full' ? 'full' : process.argv[2] === 'sync' ? 'sync' : 'entry';
const shellRoot = process.env.DSH_WB_SHELL_ROOT ?? '';
const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const diy = join(home, 'workbench', 'diy');
const manifest = join(diy, 'package.json');
const syncState = join(diy, '.sync.json');
const syncLock = join(diy, '.sync.lock');
const pnpmPin = 'pnpm@10.32.1';
const pnpm = which.sync('pnpm', { nothrow: true }) ?? 'pnpm';

function say(message) {
  process.stdout.write(`[dsh-workbench] ${message}\n`);
}

function versionOf(file) {
  try {
    const read = JSON.parse(readFileSync(file, 'utf8'));
    return typeof read.version === 'string' ? read.version : '';
  } catch {
    return '';
  }
}

function shellVersion() {
  if (shellRoot === '') return '';
  const version = versionOf(join(shellRoot, 'package.json'));
  if (version !== '') return version;
  say('读不到工作台版本（DSH_WB_SHELL_ROOT），工坊骨架先不建。');
  return '';
}

function primitivesVersion() {
  if (shellRoot === '') return '';
  try {
    const read = JSON.parse(readFileSync(join(shellRoot, 'package.json'), 'utf8'));
    const version = read.devDependencies?.['@deepseek-ai/dsh-client-ui-primitives'];
    return typeof version === 'string' ? version : '';
  } catch {
    return '';
  }
}

function repoRoot() {
  const parent = dirname(shellRoot);
  return existsSync(join(parent, 'module-tools')) && existsSync(join(parent, 'shared')) ? parent : '';
}

function specs(version) {
  const root = repoRoot();
  if (root !== '') {
    return {
      core: `link:${resolve(shellRoot)}`,
      tools: `link:${resolve(join(root, 'module-tools'))}`,
      shared: `link:${resolve(join(root, 'shared'))}`,
    };
  }
  return {
    core: `^${version}`,
    tools: `^${version}`,
    shared: `^${version}`,
  };
}

function ensureSkills() {
  const source = join(shellRoot, 'skills', 'workbench-module-diy');
  if (!existsSync(source)) return;
  const link = join(diy, '.agents', 'skills', 'workbench-module-diy');
  try {
    const stat = lstatSync(link);
    if (!stat.isSymbolicLink()) return;
    if (resolve(readlinkSync(link)) === resolve(source)) return;
    rmSync(link, { force: true });
  } catch {

  }
  mkdirSync(dirname(link), { recursive: true });
  try {
    symlinkSync(resolve(source), link, process.platform === 'win32' ? 'junction' : 'dir');
    say(`工坊指引已链上：${link}`);
  } catch (error) {
    say(`DIY 指引没挂上（${String(error)}）—— 不影响启动。`);
  }
}

function writeSkeleton(version) {
  mkdirSync(join(diy, 'packages'), { recursive: true });
  const target = specs(version);
  const devDependencies = {
    '@dsh-workbench/core': target.core,
    '@dsh-workbench/module-tools': target.tools,
    '@dsh-workbench/shared': target.shared,
    '@types/node': '^24.19.0',
    '@types/react': '^19.3.0',
    esbuild: '^0.28.2',
    react: '^19.3.0',
    typescript: '5.9',
    vitest: '^5.0.2',
  };
  const primitives = primitivesVersion();
  if (primitives !== '') devDependencies['@deepseek-ai/dsh-client-ui-primitives'] = primitives;
  const packageJson = {
    name: 'dsh-workbench-diy',
    version: '0.0.0',
    private: true,
    description: 'DIY 工坊：工作台模块在这里造。这个目录由 dsh-workbench 生成。',
    packageManager: pnpmPin,
    devDependencies,
    pnpm: {
      overrides: {
        '@dsh-workbench/core': target.core,
        '@dsh-workbench/module-tools': target.tools,
        '@dsh-workbench/shared': target.shared,
      },
    },
  };
  writeFileSync(manifest, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
  writeFileSync(
    join(diy, 'pnpm-workspace.yaml'),
    'packages:\n  - "packages/*"\n\nonlyBuiltDependencies:\n  - esbuild\n',
    'utf8',
  );
  const store = join(diy, '.pnpm-store').replaceAll('\\', '/');
  const cache = join(diy, '.npm-cache').replaceAll('\\', '/');
  writeFileSync(join(diy, '.npmrc'), `store-dir=${store}\ncache-dir=${cache}\n`, 'utf8');
  writeFileSync(
    join(diy, 'README.md'),
    [
      '# DIY 工坊',
      '',
      '工作台模块在这里造。一个模块一个目录，都住在 `packages/` 下。',
      '',
      '- 造一个新模块：`dsh-wb-module init <名字> --dir packages/module-<名字>`',
      '- 每个模块：`pnpm build` / `pnpm typecheck` / `pnpm test` / `pnpm selfcheck`',
      '',
    ].join('\n'),
    'utf8',
  );
  say(`建 DIY 工坊 ${diy}`);
}

function installedCoreVersion() {
  return versionOf(join(diy, 'node_modules', '@dsh-workbench', 'core', 'package.json'));
}

function syncVersions(version) {
  const target = specs(version);
  const manifestValue = JSON.parse(readFileSync(manifest, 'utf8'));
  manifestValue.devDependencies = {
    ...manifestValue.devDependencies,
    '@dsh-workbench/core': target.core,
    '@dsh-workbench/module-tools': target.tools,
    '@dsh-workbench/shared': target.shared,
  };
  manifestValue.pnpm = {
    ...manifestValue.pnpm,
    overrides: {
      '@dsh-workbench/core': target.core,
      '@dsh-workbench/module-tools': target.tools,
      '@dsh-workbench/shared': target.shared,
    },
  };
  writeFileSync(manifest, `${JSON.stringify(manifestValue, null, 2)}\n`, 'utf8');
  say(`工坊工具链对齐到 ${version}`);
}

function writeState(state, version, reason = '') {
  const payload = { state, version, at: new Date().toISOString() };
  if (reason !== '') payload.reason = reason;
  try {
    writeFileAtomic.sync(syncState, `${JSON.stringify(payload)}\n`, 'utf8');
  } catch {

  }
}

function sleep(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function lockAlive() {
  if (!existsSync(syncLock)) return false;
  try {
    const read = JSON.parse(readFileSync(syncLock, 'utf8'));
    if (typeof read.pid !== 'number') return false;
    process.kill(read.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireLock() {
  const waitMs = Number(process.env.DSH_WB_SYNC_WAIT_MS ?? '5000');
  const deadline = Date.now() + (Number.isFinite(waitMs) && waitMs > 0 ? waitMs : 0);
  for (;;) {
    if (!lockAlive()) {
      try {
        rmSync(syncLock, { force: true });
        writeFileSync(syncLock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), {
          flag: 'wx',
        });
        return true;
      } catch {
        say('工坊自愈锁没抢到，这一轮跳过。');
        return false;
      }
    }
    if (Date.now() >= deadline) {
      say('另一个工坊自愈正持锁，等过一轮仍没抢到，这一轮跳过。');
      return false;
    }
    sleep(Math.min(250, Math.max(0, deadline - Date.now())));
  }
}

function releaseLock() {
  try {
    rmSync(syncLock, { force: true });
  } catch {

  }
}

function manifestCoreSpec() {
  try {
    const read = JSON.parse(readFileSync(manifest, 'utf8'));
    return read.devDependencies?.['@dsh-workbench/core'] ?? '';
  } catch {
    return '';
  }
}

function install() {
  say('装工坊依赖（第一次会下载 react / typescript / vitest）...');
  return new Promise((resolve) => {
    const child = spawn(`"${pnpm}" install`, {
      cwd: diy,
      stdio: 'inherit',
      shell: true,
      env: process.env,
      windowsHide: true,
    });
    child.on('error', (error) => {
      say(`pnpm 没跑起来：${String(error)}`);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

const version = shellVersion();

if (!existsSync(manifest)) {
  if (mode === 'entry') {
    say('工坊骨架还没建，等 full 那一趟。');
    process.exit(0);
  }
  if (version === '') process.exit(0);
  writeSkeleton(version);
}

ensureSkills();

const depsMissing = !existsSync(join(diy, 'node_modules'));
if (depsMissing && mode === 'entry') process.exit(0);
if (version === '') process.exit(0);

const installed = installedCoreVersion();
const target = specs(version);
const outdated = manifestCoreSpec() !== target.core || installed !== version;
if (!depsMissing && !outdated) {
  writeState('ok', version);
  process.exit(0);
}

if (!acquireLock()) process.exit(0);
let heartbeat = null;
try {
  writeState('syncing', version);
  heartbeat = globalThis.setInterval(() => writeState('syncing', version), 1000);
  if (outdated) syncVersions(version);
  const code = await install();
  globalThis.clearInterval(heartbeat);
  writeState(code === 0 ? 'ok' : 'failed', version, code === 0 ? '' : 'pnpm install 失败');
  process.exit(code);
} finally {
  if (heartbeat !== null) globalThis.clearInterval(heartbeat);
  releaseLock();
}
