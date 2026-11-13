import { execa } from 'execa';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SHELL_KIND, createRealShell, createReporter, loadHost } from './harness.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const WORK = mkdtempSync(join(tmpdir(), 'dsh-runtime-heal-'));
const { check, finish } = createReporter();
const FIXTURE = '@jackwener/opencli';
const FIXTURE_VERSION = '1.0.0';
const FIXTURE_TGZ = join(WORK, 'jackwener-opencli-1.0.0.tgz');

const loadRuntime = () =>
  import(pathToFileURL(join(REPO, 'packages', 'adapter-runtime', 'dist', 'index.js')).href);
const loadProbe = () =>
  import(pathToFileURL(join(REPO, 'packages', 'adapter-probe', 'dist', 'isolated-install.js')).href);
const loadSharedHost = () =>
  import(pathToFileURL(join(REPO, 'packages', 'shared', 'dist', 'host.js')).href);

const pnpm = (args, options = {}) =>
  execa('pnpm', args, {
    reject: false,
    stripFinalNewline: false,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });

const unquote = (value) => value.replace(/^'(.*)'$/su, '$1').replace(/^"(.*)"$/su, '$1');

const storeArgOf = (command) => unquote(/--store-dir\s+(\S+)/u.exec(command)?.[1] ?? '');

const dirArgOf = (command) => unquote(/--dir\s+(\S+)/u.exec(command)?.[1] ?? '');

function recordStore(project, storeDir) {
  const dir = join(project, 'node_modules');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, '.modules.yaml'),
    `${JSON.stringify({ hoistedDependencies: {}, storeDir, virtualStoreDir: '.pnpm', packageManager: 'pnpm@10.32.1' }, null, 2)}\n`,
    'utf8',
  );
}

async function realRun() {
  const shell = createRealShell(await loadHost(), { kind: SHELL_KIND });
  return async (command) => {
    const done = await shell.execute(shell.resolve({ command }));
    const result = await done.result();
    const detail = `${result.stdout.text}\n${result.stderr.text}`.trim();
    return { ok: result.exitCode === 0 && result.timedOut !== true, detail };
  };
}

async function storeFollowRound(runtime) {
  const root = join(WORK, 'root');
  process.env.DSH_WORKBENCH_HOME = root;
  const toolchain = join(root, 'opencli', 'toolchain');
  const recorded = join(WORK, 'recorded-store');
  recordStore(toolchain, recorded);
  const command = runtime.isolatedInstallCommand();
  check(
    '★ 安装命令的 --store-dir 就是既有 node_modules 记录的那个（结构化解析，不是包含关系）',
    runtime.storeDirFor(toolchain) === recorded && storeArgOf(command) === recorded,
    `storeDirFor=${runtime.storeDirFor(toolchain)} · --store-dir=${storeArgOf(command)}`,
  );
  check(
    '安装命令的 --dir 指向隔离 toolchain（带引号的整体）',
    dirArgOf(command) === runtime.toolchainDir(),
    `--dir=${dirArgOf(command)}`,
  );
  const foreign = join(WORK, 'npm-cache');
  recordStore(toolchain, foreign);
  check(
    '★ 记的是别的 store 就跟着它走（既有安装不被翻面）',
    runtime.storeDirFor(toolchain) === foreign && storeArgOf(runtime.isolatedInstallCommand()) === foreign,
    `--store-dir=${storeArgOf(runtime.isolatedInstallCommand())}`,
  );
}

async function danglingRound(runtime) {
  const root = join(WORK, 'root-dangling');
  process.env.DSH_WORKBENCH_HOME = root;
  const opencli = runtime.toolchainOpencliDir();
  mkdirSync(join(opencli, '..'), { recursive: true });
  symlinkSync(join(WORK, 'not-installed'), opencli, 'junction');
  check(
    '★ 断链不算「装好了」（体检判据看得见）',
    existsSync(opencli) === false && existsSync(join(opencli, 'package.json')) === false,
    `existsSync(link)=${existsSync(opencli)}`,
  );
  rmSync(opencli, { recursive: true, force: true });
  mkdirSync(opencli, { recursive: true });
  writeFileSync(join(opencli, 'package.json'), '{}\n', 'utf8');
  check(
    '真装上了就算「装好了」',
    existsSync(join(opencli, 'package.json')) === true,
    `existsSync=${existsSync(join(opencli, 'package.json'))}`,
  );
}

function pinPnpmForWork() {
  const root = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  const pinned = String(root.packageManager ?? '').replace(/^pnpm@/u, '');
  if (pinned === '') return;
  writeFileSync(
    join(WORK, 'package.json'),
    `${JSON.stringify({ name: 'runtime-heal-work', private: true, packageManager: `pnpm@${pinned}` }, null, 2)}\n`,
    'utf8',
  );
}

async function reachabilityRound() {
  pinPnpmForWork();
  const version = await pnpm(['--version'], { cwd: WORK });
  const major = Number(String(version.stdout).trim().split('.')[0] ?? '0');
  process.stdout.write(`pnpm=${String(version.stdout).trim()} · platform=${process.platform}\n`);
  check(
    'pnpm 主版本是 10（跨 store 的语义按 10 断言；漂版本要显式看见）',
    major === 10,
    `实测主版本 ${String(major)}`,
  );
  return major === 10;
}

async function packFixture() {
  const dir = join(WORK, 'fixture');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify({ name: FIXTURE, version: FIXTURE_VERSION })}\n`,
    'utf8',
  );
  const packed = await pnpm(['pack', '--pack-destination', WORK], { cwd: dir });
  check('本地 tarball 打得出来（整条 smoke 不碰网络）', existsSync(FIXTURE_TGZ), `exit=${String(packed.exitCode)}`);
  return existsSync(FIXTURE_TGZ);
}

async function productHealRound(runtime, probe, sharedHost) {
  const root = join(WORK, 'root-heal');
  process.env.DSH_WORKBENCH_HOME = root;
  const toolchain = runtime.toolchainDir();
  mkdirSync(toolchain, { recursive: true });
  const storeA = join(WORK, 'heal-store-a');
  const storeB = join(WORK, 'heal-store-b');
  const seeded = await pnpm(['add', '--dir', toolchain, FIXTURE_TGZ, '--store-dir', storeA], { cwd: WORK });
  check(
    '先在同一个 toolchain 里用 store A 装出记录（模拟升级现场）',
    seeded.exitCode === 0 && existsSync(join(toolchain, 'node_modules', '.modules.yaml')),
    `exit=${String(seeded.exitCode)}`,
  );

  const run = await realRun();
  const details = [];
  const installCommand = (dir) =>
    `pnpm add --dir ${sharedHost.quoteShellArg(dir)} ${sharedHost.quoteShellArg(FIXTURE_TGZ)} --store-dir ${sharedHost.quoteShellArg(storeB)}`;
  let attempts = 0;
  const deps = {
    liveDir: toolchain,
    command: installCommand,
    run: async (command) => {
      attempts += 1;
      const result = await run(command);
      details.push(result.detail);
      return result;
    },
    ready: (dir) => existsSync(join(dir, 'node_modules', '@jackwener', 'opencli', 'package.json')),
    describe: (dir) => dir,
    log: (message) => process.stdout.write(`${message}\n`),
  };

  const samePath = (value, expected) => {
    const flat = (input) => input.replaceAll('\\', '/').toLowerCase();
    return flat(value).includes(flat(expected));
  };
  const storeAfter = () => {
    const recorded = join(toolchain, 'node_modules', '.modules.yaml');
    return existsSync(recorded) ? readFileSync(recorded, 'utf8') : '';
  };
  const prevSiblings = () =>
    existsSync(dirname(toolchain))
      ? readdirSync(dirname(toolchain)).filter((entry) => entry.startsWith(`${basename(toolchain)}.prev-`)).length
      : 0;

  const outcome = await probe.installIsolatedRuntime(deps);

  check(
    '★ 就地升级不会被旧 store 卡住：装到暂存目录再换进来，真 pnpm 跑通',
    outcome.ok === true && attempts === 1 && details[0] !== undefined && !details[0].includes('ERR_PNPM_UNEXPECTED_STORE'),
    `ok=${String(outcome.ok)} · 尝试=${String(attempts)} · 首遍首行=${details[0]?.split('\n')[0]?.slice(0, 60)}`,
  );
  check(
    '★ 旧的 live 树没被就地覆盖：留了一份 prev 在旁边',
    prevSiblings() >= 1,
    `prev 个数=${String(prevSiblings())}`,
  );
  check(
    '换进来的是新 store 装的那份：node_modules 记录里 storeDir 已经是 store B',
    samePath(storeAfter(), storeB),
    `modules.yaml 里 store B=${String(samePath(storeAfter(), storeB))}`,
  );
  check(
    '重装后那份 opencli 真的在点名的位置',
    existsSync(join(runtime.toolchainOpencliDir(), 'package.json')),
    `toolchainOpencliDir=${runtime.toolchainOpencliDir()}`,
  );

  let failFirst = true;
  let retried = 0;
  const retryOutcome = await probe.installIsolatedRuntime({
    ...deps,
    run: async (command) => {
      retried += 1;
      if (failFirst) {
        failFirst = false;
        return { ok: false, detail: 'ERR_PNPM_UNEXPECTED_STORE Expected store-dir /old, got /new', stdout: '', stderr: '' };
      }
      return run(command);
    },
  });

  check(
    '★ 第一遍没装上就清一次再装（同一条命令，第二遍真 pnpm 装好）',
    retryOutcome.ok === true && retryOutcome.reinstalled === true && retried === 2,
    `ok=${String(retryOutcome.ok)} · reinstalled=${String(retryOutcome.reinstalled)} · 尝试=${String(retried)}`,
  );
}

const BUNDLE = '@dsh-workbench/core';

function profileWithBundles(profileDir, manifest) {
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(profileDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return join(profileDir, 'package.json');
}

async function bundleRowRound(sharedHost) {
  const profileDir = join(WORK, 'bundle-profile', 'profiles', 'workbench');
  const deps = { [BUNDLE]: '1.2.3-beta.2' };
  const only = (bundles) => ({ name: 'workbench', private: true, type: 'module', dependencies: deps, dsh: { profile: { bundles } } });

  const file = profileWithBundles(profileDir, only(['@deepseek-ai/dsh-base']));
  const first = sharedHost.ensureProfileBundle(profileDir);
  check('★ 清单那一行被摘掉 → 同一步补回（不靠人再手改一遍）', first.repaired === true && first.selected === true);
  check(
    '★ 补在末尾：别的组合包顺序一个不动',
    JSON.stringify(first.bundles) === JSON.stringify(['@deepseek-ai/dsh-base', BUNDLE]),
    first.bundles.join(' / '),
  );

  const after = readFileSync(file, 'utf8');
  const second = sharedHost.ensureProfileBundle(profileDir);
  check('★ 补回是幂等的：第二次一个字节都不写', second.repaired === false && readFileSync(file, 'utf8') === after);

  profileWithBundles(profileDir, { name: 'workbench', private: true, type: 'module', dependencies: {}, dsh: { profile: { bundles: [] } } });
  const before = readFileSync(file, 'utf8');
  const refused = sharedHost.ensureProfileBundle(profileDir);
  check(
    '★ 依赖没装就不硬塞：说清原因，一个字节都不写（人话交给调用点）',
    refused.refusal === 'dependency-missing' && readFileSync(file, 'utf8') === before,
    String(refused.refusal),
  );

  writeFileSync(file, '{ 不是 JSON\n', 'utf8');
  const broken = readFileSync(file, 'utf8');
  const unreadable = sharedHost.ensureProfileBundle(profileDir);
  check(
    '★ 清单读不了 → 说清 broken-manifest，同样不写',
    unreadable.refusal === 'broken-manifest' && readFileSync(file, 'utf8') === broken,
    String(unreadable.refusal),
  );
}

async function packAndHeal(runtime, probe, sharedHost) {
  if (!(await packFixture())) return;
  if (!(await reachabilityRound())) return;
  await productHealRound(runtime, probe, sharedHost);
}

try {
  process.stdout.write(`隔离运行时自愈冒烟：${process.platform} · node=${process.version}\n`);
  const runtime = await loadRuntime();
  const probe = await loadProbe();
  const sharedHost = await loadSharedHost();
  await storeFollowRound(runtime);
  await danglingRound(runtime);
  await packAndHeal(runtime, probe, sharedHost);
  await bundleRowRound(sharedHost);
} finally {
  rmSync(WORK, { recursive: true, force: true });
}

finish();
