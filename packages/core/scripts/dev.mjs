import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const PKG = '@dsh-workbench/core';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(pkgRoot, 'bin', 'dsh-workbench');

const desktop = process.argv.includes('--desktop');

const port = Number(process.env.WORKBENCH_PORT ?? 3081);
const profile = process.env.WORKBENCH_PROFILE?.trim() || 'workbench';
const dshHome = process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh');
const profileDir = path.join(dshHome, 'profiles', profile);

const watchers = [];
let app;
let closing = false;

function realpathOr(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return null;
  }
}

function profilePointsHere() {
  const there = realpathOr(path.join(profileDir, 'node_modules', PKG));
  const here = realpathOr(pkgRoot);
  return there !== null && there === here;
}

function reportDesktopProfile() {
  const there = realpathOr(path.join(dshHome, 'profiles', 'desktop', 'node_modules', PKG));
  const here = realpathOr(pkgRoot);
  if (there !== null && there === here) {
    console.log('dev：Desktop 的 desktop profile 里那份就是本目录 —— 重建出来的就是它要热换的产物。');
    return;
  }
  console.log(
    `dev：⚠ Desktop 的 desktop profile ${there === null ? '里还没有工作台' : '里那份不是本目录'} —— 改了不会进那个窗口。`,
  );
  console.log('     先把本目录装进 desktop profile（Desktop 的插件页，或 app 自带 CLI 的 plugin add），再开这条命令。');
}

function exitCodeOf(child) {
  return new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve(code ?? (signal === undefined ? 0 : 1)));
  });
}

async function ensureProfile() {
  const why = [];
  if (!fs.existsSync(path.join(profileDir, 'package.json'))) {
    why.push(`profile '${profile}' 还不存在（${profileDir}）`);
  } else if (!profilePointsHere()) {
    why.push(`profile 里那份 ${PKG} 不是本目录这份`);
  }
  if (why.length === 0) return;

  console.log(`dev：先跑一次 setup —— ${why.join('；')}`);
  console.log(`     （${path.relative(pkgRoot, bin)} setup，幂等，可重复跑）`);
  const setup = spawn('bash', [bin, 'setup'], { cwd: pkgRoot, stdio: 'inherit' });
  const code = await exitCodeOf(setup);
  if (code !== 0) {
    console.error(`dev：setup 失败（退出码 ${code}）——先手动跑一次看它怎么说：${bin} setup`);
    process.exit(code);
  }
}

async function watchMode(mode) {
  const watcher = await build({ root: pkgRoot, mode, logLevel: 'info', build: { watch: {} } });
  watchers.push(watcher);
  return new Promise((resolve) => {
    let ready = false;
    watcher.on('event', (event) => {
      if (event.code === 'END') {
        if (!ready) {
          ready = true;
          resolve();
        }
        return;
      }
      if (event.code === 'ERROR') {
        const detail = event.error instanceof Error ? `：${event.error.message}` : '';
        console.error(`dev：${mode} 构建失败${detail}${ready ? '' : '（修好后工作台才会起来）'}`);
      }
    });
  });
}

async function busy(target) {
  const one = (host) =>
    new Promise((resolve) => {
      const socket = net.connect({ port: target, host });
      const done = (value) => {
        socket.removeAllListeners();
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(400);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
    });
  const [v4, v6] = await Promise.all([one('127.0.0.1'), one('::1')]);
  return v4 || v6;
}

function shutdown(code) {
  if (closing) return;
  closing = true;
  for (const watcher of watchers) {
    try {
      watcher.close();
    } catch {
    }
  }
  app?.kill('SIGTERM');
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => {
  if (closing) process.exit(130);
  console.log(desktop ? '\ndev：收工 —— 关掉监听。' : '\ndev：收工 —— 关掉监听与工作台。');
  shutdown(0);
});
process.on('SIGTERM', () => shutdown(0));

if (desktop) reportDesktopProfile();
else await ensureProfile();

function newestMtime(dir) {
  if (!fs.existsSync(dir)) return 0;
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : fs.statSync(full).mtimeMs);
  }
  return newest;
}

function reportSharedBuildFailure(code) {
  console.error(`dev：packages/shared 重建失败（退出码 ${code}）`);
  console.error('     （自动重建走的是它自己声明的 build 脚本；失败就手动跑一次：');
  console.error('       pnpm --filter @dsh-workbench/shared run build）');
}

async function watchShared() {
  const sharedRoot = path.resolve(pkgRoot, '..', 'shared');
  const src = path.join(sharedRoot, 'src');
  if (!fs.existsSync(src)) return;

  const build = () =>
    exitCodeOf(spawn('pnpm', ['run', 'build'], { cwd: sharedRoot, stdio: 'inherit' }));

  if (newestMtime(src) > newestMtime(path.join(sharedRoot, 'dist'))) {
    console.log('dev：packages/shared 的产物比源码旧（多半刚 pull 过）——先重建它');
    const code = await build();
    if (code !== 0) reportSharedBuildFailure(code);
  }

  let running = false;
  let pending = false;
  const rebuild = () => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    void build().then((code) => {
      running = false;
      if (code !== 0) reportSharedBuildFailure(code);
      if (pending) {
        pending = false;
        rebuild();
      }
    });
  };

  let timer = null;
  const watcher = fs.watch(src, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 120);
  });
  watchers.push(watcher);
  console.log('dev：也监听 packages/shared/src/**（改了它先重建 shared，vite 再重建 client.js）');
}

await watchShared();
console.log('dev：监听 src/**，重建 dist/host/index.js 与 client.js…');
console.log('     客户端改动由 dsh-client-hmr 自动热换（约 0.5–1 秒）；宿主改动看 hmr 配置。');

for (const mode of ['host', 'client']) {
  await watchMode(mode);
}

console.log('dev：产物就绪。');

if (desktop) {
  console.log('dev:desktop：只重建产物 —— 不碰 profile、不起 :3081。');
  console.log('     客户端改动由 dsh-client-hmr 自动热换；宿主改动要 desktop profile 的 hmr.root 指到本仓才热换。');
} else if (process.env.DSH_WB_DEV_NO_LAUNCH === '1') {
  console.log('dev：DSH_WB_DEV_NO_LAUNCH=1 —— 只监听，工作台自己起。');
} else if (await busy(port)) {
  console.log(`dev：:${port} 已经有工作台在跑 —— 只监听重建，不重复起第二个。`);
  console.log('     浏览器里那个页面不用刷新，客户端改动会自己换。');
} else {
  console.log(`dev：起工作台 :${port} …`);
  app = spawn(bin, [], { cwd: pkgRoot, stdio: 'inherit', env: process.env });
  app.on('exit', (code, signal) => {
    if (closing) return;
    console.log(`dev：工作台退出了（${code ?? signal}）——关掉监听。`);
    shutdown(code ?? 1);
  });
}
