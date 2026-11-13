import { execa } from 'execa';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createReporter } from './harness.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const probe = await import(pathToFileURL(join(ROOT, 'packages', 'adapter-probe', 'dist', 'index.js')).href);
const { check, finish } = createReporter();

const PACKAGES = probe.SELF_UPDATE_PACKAGES;
const CORE = '@dsh-workbench/core';
const OLD = '1.2.3-beta.2';
const NEW = '1.2.3-beta.3';
const NEWER = '1.2.3-beta.4';
const BAD = '1.2.3-beta.5';

function realMarkerStamps() {
  const real = join(homedir(), '.dsh', 'workbench');
  return ['self-update.json', 'self-update-boot.json'].map((name) => {
    const file = join(real, name);
    return existsSync(file) ? String(statSync(file).mtimeMs) : 'missing';
  });
}

const beforeReal = realMarkerStamps();
const WORK = mkdtempSync(join(tmpdir(), 'dsh-self-update-links-'));
const HOME = join(WORK, 'dsh-home');
const BIN = join(WORK, 'bin');
const SHIM_LOG = join(BIN, 'pnpm-log.jsonl');
process.env.DSH_HOME = HOME;
process.env.DSH_WORKBENCH_HOME = join(HOME, 'workbench');

const PROFILE_DIR = join(HOME, 'profiles', 'workbench');
const paths = probe.selfUpdatePaths();
const shimBody = join(BIN, 'pnpm.mjs');

function packageFiles(dir, version, { complete = true } = {}) {
  for (const pkg of PACKAGES) {
    const into = join(dir, 'node_modules', pkg);
    mkdirSync(into, { recursive: true });
    writeFileSync(join(into, 'package.json'), JSON.stringify({ name: pkg, version }));
    if (!complete) continue;
    for (const artifact of ['client.js', 'dist/client/index.js', 'dist/host/index.js']) {
      mkdirSync(dirname(join(into, artifact)), { recursive: true });
      writeFileSync(join(into, artifact), `export const ${'artifact'} = 1;\n`);
    }
  }
}

function writeShim() {
  mkdirSync(BIN, { recursive: true });
  writeFileSync(
    `${shimBody}`,
    [
      "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';",
      "import { dirname, join } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      '',
      "const LOG = fileURLToPath(new URL('./pnpm-log.jsonl', import.meta.url));",
      'const argv = process.argv.slice(2);',
      "const at = (dir, version, complete) => {",
      "  for (const pkg of JSON.parse(process.env.WB_LINKS_PACKAGES)) {",
      "    const into = join(dir, 'node_modules', pkg);",
      '    mkdirSync(into, { recursive: true });',
      "    writeFileSync(join(into, 'package.json'), JSON.stringify({ name: pkg, version }));",
      '    if (!complete) continue;',
      "    for (const artifact of ['client.js', 'dist/client/index.js', 'dist/host/index.js']) {",
      '      mkdirSync(dirname(join(into, artifact)), { recursive: true });',
      "      writeFileSync(join(into, artifact), 'export const artifact = 1;\\n');",
      '    }',
      '  }',
      '};',
      'const dir = argv[argv.indexOf("--dir") + 1] ?? "";',
      "appendFileSync(LOG, JSON.stringify({ argv, dir }) + '\\n');",
      'at(dir, process.env.WB_LINKS_VERSION, process.env.WB_LINKS_COMPLETE === "1");',
      '',
    ].join('\n'),
  );
}

function installCalls() {
  if (!existsSync(SHIM_LOG)) return [];
  return readFileSync(SHIM_LOG, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

function clearInstallCalls() {
  rmSync(SHIM_LOG, { force: true });
}

function realDirEntries() {
  return PACKAGES.filter((pkg) => {
    const link = join(PROFILE_DIR, 'node_modules', pkg);
    if (!existsSync(link)) return false;
    return lstatSync(link).isSymbolicLink() === false;
  });
}

function linkedTo(version) {
  const base = realpathSync(join(paths.versionsDir, version));
  return PACKAGES.every((pkg) => {
    const link = join(PROFILE_DIR, 'node_modules', pkg);
    if (!existsSync(link)) return false;
    if (lstatSync(link).isSymbolicLink() === false) return false;
    return realpathSync(link).startsWith(base);
  });
}

function marker() {
  return JSON.parse(readFileSync(paths.marker, 'utf8'));
}

function bundlesHasRow() {
  const manifest = JSON.parse(readFileSync(join(PROFILE_DIR, 'package.json'), 'utf8'));
  return (manifest.dsh?.profile?.bundles ?? []).includes(CORE);
}

function fingerprint(version) {
  const dir = join(paths.versionsDir, version);
  const info = statSync(dir);
  return `${String(info.ino)}:${String(info.mtimeMs)}`;
}

async function update(from, to, options) {
  const request = { dshHome: HOME, profile: 'workbench', pkg: CORE, from, to, pinned: true };
  const plan = probe.planSelfUpdate(request, new Date(), {
    at: new Date().toISOString(),
    bootWindowMs: options.bootWindowMs,
    bootGraceMs: 0,
    bootPollMs: 0,
  });
  mkdirSync(paths.dir, { recursive: true });
  const steps = {
    ...plan.steps,
    steps: plan.steps.steps.map((step) =>
      step.kind === 'install'
        ? {
            ...step,
            file: process.execPath,
            args: [shimBody, ...step.args],
            env: {
              ...step.env,
              WB_LINKS_PACKAGES: JSON.stringify(PACKAGES),
              WB_LINKS_VERSION: to,
              WB_LINKS_COMPLETE: options.complete === false ? '0' : '1',
            },
          }
        : step,
    ),
  };
  writeFileSync(plan.planFile, `${JSON.stringify(steps, null, 2)}\n`);
  writeFileSync(paths.marker, `${JSON.stringify(plan.marker)}\n`);
  return execa(plan.command.file, plan.command.args, { reject: false, stdio: 'pipe' });
}

writeShim();
mkdirSync(join(PROFILE_DIR, 'node_modules', '@dsh-workbench'), { recursive: true });
writeFileSync(
  join(PROFILE_DIR, 'package.json'),
  JSON.stringify({
    name: 'workbench',
    private: true,
    type: 'module',
    dependencies: { [CORE]: OLD },
    dsh: { profile: { bundles: [CORE] } },
  }),
);
for (const pkg of PACKAGES) {
  const into = join(PROFILE_DIR, 'node_modules', pkg);
  mkdirSync(into, { recursive: true });
  writeFileSync(join(into, 'package.json'), JSON.stringify({ name: pkg, version: OLD }));
}
packageFiles(join(paths.versionsDir, OLD), OLD);

const oldFingerprint = fingerprint(OLD);

clearInstallCalls();
await update(OLD, NEW, { bootWindowMs: 0 });
check('① 一次性迁移：七条真目录全换成链接', linkedTo(NEW), `${realDirEntries().length} 条还是真目录`);
check('① 旧版本目录一个字节没动（更新不删在用的目录）', fingerprint(OLD) === oldFingerprint, fingerprint(OLD));
check('① 清单那一行还在', bundlesHasRow());
check('① marker 说"已就绪，重启后生效"', marker().state === 'pending-restart', marker().state);
check('① 装到了独立版本目录里', existsSync(join(paths.versionsDir, NEW, 'node_modules', CORE, 'client.js')));

const newFingerprint = fingerprint(NEW);
clearInstallCalls();
await update(NEW, NEWER, { bootWindowMs: 0 });
check('② 迁移之后再更新一次：链接指到更新的一版', linkedTo(NEWER));
check('② 上一次那个版本目录 inode/mtime 没变', fingerprint(NEW) === newFingerprint, fingerprint(NEW));

const newerFingerprint = fingerprint(NEWER);
clearInstallCalls();
const badRun = await update(NEWER, BAD, { bootWindowMs: 0, complete: false });
check('③ 装不齐：那一步没成，链接仍指在旧版', linkedTo(NEWER), `退出码 ${String(badRun.exitCode)}`);
check('③ 清单那一行还在', bundlesHasRow());
check('③ marker 落 failed 且说清是"装不齐"', marker().state === 'failed' && marker().reason === 'incomplete', JSON.stringify(marker()));
check('③ 上一次那个版本目录没被动过', fingerprint(NEWER) === newerFingerprint);
check('③ 坏版本的目录没被当成能用的那一版', !existsSync(join(paths.versionsDir, BAD, 'node_modules', CORE, 'client.js')));

clearInstallCalls();
const superseded = join(paths.versionsDir, NEWER);
writeFileSync(
  probe.selfUpdateBootFile(),
  `${JSON.stringify({ version: NEWER, at: new Date(Date.now() + 1000).toISOString(), pid: process.pid })}\n`,
);
await update(NEWER, BAD, { bootWindowMs: 30_000 });
check('④ 起来了但不是新版 → 不自动回滚，链接留在装好的那一版', linkedTo(BAD), `现在指到 ${realpathSync(join(PROFILE_DIR, 'node_modules', CORE))}`);
check('④ marker 留 pending-restart（等下一次确认，不自己翻回去）', marker().state === 'pending-restart', JSON.stringify(marker()));
const versionInstalls = installCalls().filter((call) => String(call.dir).startsWith(paths.versionsDir));
check(
  '④ 不为回滚额外装一遍（就这一版的安装，没有第二次）',
  versionInstalls.length === 1,
  `装了 ${String(versionInstalls.length)} 次（另有 ${String(installCalls().length - versionInstalls.length)} 次是换链后的 profile 清单同步）`,
);
check('④ 那一版目录还在', existsSync(superseded));

check(
  '⑤ 整段跑完没碰过真实数据根（这是踩过两次的那个坑）',
  JSON.stringify(realMarkerStamps()) === JSON.stringify(beforeReal),
  realMarkerStamps().join(' / '),
);

rmSync(WORK, { recursive: true, force: true });
finish();
