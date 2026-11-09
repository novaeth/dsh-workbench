import {
  chmodSync,
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
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { IS_WIN, SHELL_KIND, createRealShell, createReporter, loadHost } from './harness.mjs';

const host = await loadHost();
const KIND = SHELL_KIND;
const WORK = mkdtempSync(join(tmpdir(), 'dsh-install-plan-'));
const { check, finish, same } = createReporter();
const commands = [];

const BIN = join(WORK, 'bin');
const FAKE_TOOL = join(BIN, 'fake-tool.mjs');
const FAKE_LOG = join(BIN, 'fake-log.jsonl');
const PNPM = join(BIN, IS_WIN ? 'pnpm.cmd' : 'pnpm');
const OPENCLI = join(BIN, IS_WIN ? 'opencli.cmd' : 'opencli');
const CHANNEL = join(WORK, 'root', 'channel');
const TARGET = join(WORK, 'root', 'plugins', 'demo', 'opencli');
const LINK = join(WORK, 'root', 'node_modules', 'demo', 'opencli');
const REGISTRY = 'https://registry.test.invalid/';
const CHANNEL_JS = 'channel-v1\n';

const q = (value) => host.quoteShellArgFor(value, process.platform);

const FAKE_TOOL_SOURCE = [
  "import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';",
  "import { join } from 'node:path';",
  "import { fileURLToPath } from 'node:url';",
  '',
  "const LOG = fileURLToPath(new URL('./fake-log.jsonl', import.meta.url));",
  'const [tool, ...argv] = process.argv.slice(2);',
  'const record = { tool, argv, registry: process.env.NPM_CONFIG_REGISTRY ?? null };',
  "const write = (row) => appendFileSync(LOG, JSON.stringify(row) + '\\n');",
  "if (tool === 'pnpm' && argv[0] === 'fail') {",
  '  write({ ...record, failed: true });',
  "  process.stderr.write('pnpm-fake: 故意失败\\n');",
  '  process.exit(7);',
  '}',
  "if (tool === 'pnpm' && argv[0] === 'install') {",
  "  const prefix = argv[argv.length - 1] ?? '';",
  '  mkdirSync(prefix, { recursive: true });',
  "  writeFileSync(join(prefix, 'pnpm-ran.txt'), 'pnpm\\n');",
  '}',
  'write(record);',
  '',
].join('\n');

function shim(name) {
  if (IS_WIN) return `@echo off\r\n"${process.execPath}" "${FAKE_TOOL}" ${name} %*\r\n`;
  return `#!/bin/sh\nexec '${process.execPath}' '${FAKE_TOOL}' ${name} "$@"\n`;
}

const seam = host.createSeam({
  shell: createRealShell(host, { defaultTimeoutMs: 30000, onCommand: (line) => commands.push(line) }),
  runtimeRoot: join(WORK, 'runtime'),
  ceiling: 'workspace-write',
});

const steps = [
  { kind: 'run', line: `${q(PNPM)} install --prefix ${q(TARGET)}` },
  { kind: 'remove', path: TARGET },
  { kind: 'mkdir', path: TARGET },
  { kind: 'copy', from: CHANNEL, to: TARGET },
  { kind: 'link', target: TARGET, path: LINK },
  { kind: 'run', line: `${q(PNPM)} fail`, optional: true },
  { kind: 'run', line: `${q(OPENCLI)} plugin install ${q(TARGET)}`, env: { NPM_CONFIG_REGISTRY: REGISTRY } },
];

function witnessed(step) {
  if (step.kind === 'remove') return { kind: step.kind, marker: existsSync(join(TARGET, 'pnpm-ran.txt')) };
  if (step.kind === 'copy') return { kind: step.kind, marker: existsSync(join(TARGET, 'pnpm-ran.txt')), dir: existsSync(TARGET) };
  return { kind: step.kind };
}

function rows() {
  if (!existsSync(FAKE_LOG)) return [];
  return readFileSync(FAKE_LOG, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
}

function prepare() {
  mkdirSync(BIN, { recursive: true });
  writeFileSync(FAKE_TOOL, FAKE_TOOL_SOURCE);
  for (const [file, name] of [
    [PNPM, 'pnpm'],
    [OPENCLI, 'opencli'],
  ]) {
    writeFileSync(file, shim(name));
    if (!IS_WIN) chmodSync(file, 0o755);
  }
  mkdirSync(join(CHANNEL, 'nested'), { recursive: true });
  writeFileSync(join(CHANNEL, 'index.js'), CHANNEL_JS);
  writeFileSync(join(CHANNEL, 'nested', 'deep.txt'), 'deep\n');
}

async function planRoundTrip() {
  const witnesses = [];
  let error;
  try {
    await host.runPlan(steps, {
      seam,
      intent: host.productWrite(),
      timeoutMs: 30000,
      check: (step) => witnesses.push(witnessed(step)),
    });
  } catch (cause) {
    error = cause;
  }
  const detail = error === undefined ? '' : `${error.name}: ${error.message}`;
  check('整条计划在当前平台（真 shell）跑完', error === undefined, detail);

  const log = rows();
  const install = log.find((row) => row.tool === 'pnpm' && row.argv?.[0] === 'install');
  check('run 把 argv 原样交给子进程（假 pnpm）', same(install?.argv, ['install', '--prefix', TARGET]), JSON.stringify(install?.argv));

  check(
    '假 pnpm 的 install 真的在 --prefix 落过盘（remove 之前）',
    witnesses[1]?.marker === true,
    JSON.stringify(witnesses[1]),
  );
  check(
    'remove 清掉了它、mkdir 又把目录立起来了（copy 之前）',
    witnesses[3]?.marker === false && witnesses[3]?.dir === true,
    JSON.stringify(witnesses[3]),
  );

  let copied;
  let nested;
  try {
    copied = readFileSync(join(TARGET, 'index.js'), 'utf8');
    nested = readFileSync(join(TARGET, 'nested', 'deep.txt'), 'utf8');
  } catch (cause) {
    copied = `读不到：${String(cause)}`;
  }
  check('copy 把渠道内容倒进目标', copied === CHANNEL_JS && nested === 'deep\n', JSON.stringify(copied));

  let viaLink;
  let linked = false;
  let points = false;
  try {
    viaLink = readFileSync(join(LINK, 'index.js'), 'utf8');
    linked = lstatSync(LINK).isSymbolicLink() && statSync(LINK).isDirectory();
    points = realpathSync(LINK) === realpathSync(TARGET);
  } catch (cause) {
    viaLink = `读不到：${String(cause)}`;
  }
  check('link 能读回目标内容', viaLink === CHANNEL_JS, JSON.stringify(viaLink));
  check('link 是链接且指向目标（win32 上是 junction）', linked && points, `linked=${String(linked)} points=${String(points)}`);

  const failed = log.find((row) => row.failed === true);
  const opencli = log.find((row) => row.tool === 'opencli');
  check(
    'optional 的失败 run 真失败了，也没把后面的步骤停下',
    error === undefined && failed !== undefined && log.indexOf(failed) < log.indexOf(opencli),
    JSON.stringify(failed),
  );

  check('带 env 的 run 把 NPM_CONFIG_REGISTRY 交给子进程', opencli?.registry === REGISTRY, JSON.stringify(opencli?.registry));
  check('带 env 的 run argv 里没有 registry', same(opencli?.argv, ['plugin', 'install', TARGET]), JSON.stringify(opencli?.argv));
  const leaked = commands.filter((line) => line.includes('NPM_CONFIG_REGISTRY='));
  check('命令行里搜不到 NPM_CONFIG_REGISTRY=', leaked.length === 0, leaked.join(' · '));
}

async function legacyLineOnWindows() {
  if (!IS_WIN) {
    process.stdout.write('⏭ 非 win32，跳过旧写法反例（那条在 POSIX 上本来就能跑）\n');
    return;
  }
  const legacyTarget = join(WORK, 'legacy', 'opencli');
  const line = `rm -rf ${q(legacyTarget)} && mkdir -p ${q(dirname(legacyTarget))} && ln -s ${q(CHANNEL)} ${q(legacyTarget)}`;
  let exitCode = null;
  let stderr;
  try {
    const out = await seam.run({ command: line, intent: host.productWrite(), timeoutMs: 30000 });
    exitCode = out.exitCode;
    stderr = out.stderr;
  } catch (cause) {
    stderr = String(cause);
  }
  check(
    '旧写法（rm -rf && mkdir -p && ln -s）经 pwsh 必然非零退出',
    exitCode !== null && exitCode !== 0,
    `退出码 ${String(exitCode)}；stderr=${String(stderr).trim().slice(0, 200)}`,
  );
  check(
    '旧写法一个文件都没装出来（链接没落地）',
    !existsSync(legacyTarget),
    `legacyTarget=${legacyTarget}`,
  );
}

try {
  process.stdout.write(`安装计划冒烟：${process.platform} · shell=${KIND} · node=${process.version}\n`);
  prepare();
  await planRoundTrip();
  await legacyLineOnWindows();
} finally {
  rmSync(WORK, { recursive: true, force: true });
}

finish();
