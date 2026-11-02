import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execa } from 'execa';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const host = await import(pathToFileURL(join(ROOT, 'packages', 'shared', 'dist', 'host.js')).href);

const KIND = process.platform === 'win32' ? 'pwsh' : 'bash';
const PWSH_PREAMBLE = '[Console]::OutputEncoding=[Text.Encoding]::UTF8;';
const WORK = mkdtempSync(join(tmpdir(), 'dsh-platform-smoke-'));
const failures = [];

function ok(name, extra = '') {
  process.stdout.write(`✅ ${name}${extra === '' ? '' : ` —— ${extra}`}\n`);
}

function bad(name, detail) {
  failures.push(`${name}：${detail}`);
  process.stdout.write(`❌ ${name} —— ${detail}\n`);
}

function check(name, pass, detail) {
  if (pass) ok(name, detail ?? '');
  else bad(name, detail ?? '');
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const realShell = {
  resolve(request) {
    const script = KIND === 'pwsh' ? `${PWSH_PREAMBLE}${request.command}` : request.command;
    const invocation = host.invocationOf(KIND, script);
    return { file: invocation.file, args: invocation.args, timeoutMs: request.timeoutMs };
  },
  async execute(spec) {
    const result = async () => {
      const done = await execa(spec.file, spec.args, {
        reject: false,
        timeout: spec.timeoutMs ?? 20000,
        windowsHide: true,
        stripFinalNewline: false,
        maxBuffer: 8 * 1024 * 1024,
      });
      return {
        exitCode: typeof done.exitCode === 'number' ? done.exitCode : null,
        timedOut: done.timedOut === true,
        aborted: false,
        stdout: { text: done.stdout ?? '', truncated: false },
        stderr: { text: done.stderr ?? '', truncated: false },
      };
    };
    return { result };
  },
};

const seam = host.createSeam({
  shell: realShell,
  runtimeRoot: join(WORK, 'runtime'),
  ceiling: 'workspace-write',
});

const probe = join(WORK, 'probe.mjs');
writeFileSync(probe, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');

const HOSTILE = [
  ['plain'],
  ['two words'],
  ["it's"],
  ['say "hi"'],
  ['$HOME', '$PATH', '$' + '{X}'],
  ['%PATH%', '%USERPROFILE%'],
  ['C:\\tmp\\a b\\c.txt'],
  ['a&b|c>d<e;f'],
  ['(paren)', 'back\\slash'],
  ['*', '?', '~'],
  ['#hash', '-flag', '--x=y'],
  ['中文·汉字', 'emoji😀'],
  ['', '  ', '\t'],
  ['{a}','[b]','$()','`cmd`'],
];

async function rendererRoundTrip() {
  for (const args of HOSTILE) {
    const shown = JSON.stringify(args);
    const out = await seam.run({
      argv: [process.execPath, probe, ...args],
      intent: host.productWrite(),
      timeoutMs: 20000,
    });
    if (out.exitCode !== 0) {
      bad(`argv 往返 ${shown}`, `退出码 ${String(out.exitCode)}，stderr=${out.stderr.slice(0, 200)}`);
      continue;
    }
    let got;
    try {
      got = JSON.parse(out.stdout.trim());
    } catch {
      bad(`argv 往返 ${shown}`, `stdout 不是 JSON：${out.stdout.slice(0, 120)}`);
      continue;
    }
    check(`argv 往返 ${shown}`, same(got, args), same(got, args) ? '' : `回来的是 ${JSON.stringify(got)}`);
  }
}

function rendererCallOperator() {
  const quoted = "'C:/a b/tool' 'x y'";
  check(
    'pwsh 的行以引号开头时补 &',
    host.callOperatorOf('pwsh', quoted) === `& ${quoted}` && host.callOperatorOf('pwsh', 'node x') === 'node x',
  );
  check(
    'bash 的行不加 &',
    host.callOperatorOf('bash', quoted) === quoted,
  );
  const invocation = host.invocationOf('pwsh', quoted);
  check(
    'pwsh 的启动参数由渲染层给',
    invocation.file === 'pwsh' &&
      same(invocation.args.slice(0, 3), ['-NoProfile', '-NonInteractive', '-Command']) &&
      invocation.args[3].startsWith("& '"),
    JSON.stringify(invocation.args),
  );
  check('渲染出来的行以 pwsh 开头', host.quotedLineOf(invocation).startsWith(`'pwsh'`));
  const bash = host.invocationOf('bash', 'echo hi');
  check('bash 的启动参数是 -c', bash.file === 'bash' && same(bash.args, ['-c', 'echo hi']));
}

async function pwshRoundTrip() {
  const probeRun = await execa('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.Major'], {
    reject: false,
    timeout: 20000,
    windowsHide: true,
  });
  if (probeRun.failed) {
    process.stdout.write('⏭ 这台机器上没有 pwsh，跳过 win32 引号往返\n');
    return;
  }
  for (const args of HOSTILE) {
    const shown = JSON.stringify(args);
    const rendered = host.callOperatorOf('pwsh', host.quotedArgvLine([process.execPath, probe, ...args], 'win32'));
    const done = await execa('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `${PWSH_PREAMBLE}${rendered}`], {
      reject: false,
      timeout: 30000,
      windowsHide: true,
      stripFinalNewline: false,
      maxBuffer: 8 * 1024 * 1024,
    });
    let got;
    try {
      got = JSON.parse(done.stdout.trim());
    } catch {
      bad(`win32 引号往返 ${shown}`, `退出码 ${String(done.exitCode)}；行=${rendered}；stderr=${String(done.stderr).slice(0, 200)}`);
      continue;
    }
    check(`win32 引号往返 ${shown}`, same(got, args), same(got, args) ? '' : `回来的是 ${JSON.stringify(got)}`);
  }
}

async function spacedPath() {
  const dir = join(WORK, 'dir with space');
  mkdirSync(dir, { recursive: true });
  const script = join(dir, 'probe.mjs');
  writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
  const out = await seam.run({
    argv: [process.execPath, script, 'a b', "c'd"],
    intent: host.productWrite(),
    timeoutMs: 20000,
  });
  let got;
  try {
    got = JSON.parse(out.stdout.trim());
  } catch {
    got = [];
  }
  check('带空格的路径当参数', out.exitCode === 0 && same(got, ['a b', "c'd"]), out.stderr.slice(0, 200));
}

async function timeoutKill() {
  const started = Date.now();
  const out = await seam.run({
    argv: [process.execPath, '-e', 'setTimeout(() => {}, 60000)'],
    intent: host.productWrite(),
    timeoutMs: 900,
  });
  const spent = Date.now() - started;
  check('超时会被收掉', out.timedOut === true && spent < 8000, `timedOut=${String(out.timedOut)}，用了 ${String(spent)}ms`);
}

function appendAndRead() {
  const file = join(WORK, 'capture', 'rec-demo.jsonl');
  host.writeTextFile(file, '');
  host.appendTextFile(file, '{"entries":[{"url":"https://a.test/接口"}]}\n');
  host.appendTextFile(file, '{"entries":[{"url":"https://a.test/b"}]}\n');
  const text = readFileSync(file, 'utf8');
  check(
    '追加写：两次都在、换行与中文都对',
    text === '{"entries":[{"url":"https://a.test/接口"}]}\n{"entries":[{"url":"https://a.test/b"}]}\n',
    JSON.stringify(text),
  );
  const tail = text.split('\n').filter((one) => one !== '').slice(-1);
  check('读回最后一行', tail.length === 1 && tail[0].includes('/b'), JSON.stringify(tail));
}

try {
  process.stdout.write(`平台冒烟：${process.platform} · shell=${KIND} · node=${process.version}\n`);
  await rendererRoundTrip();
  rendererCallOperator();
  await pwshRoundTrip();
  await spacedPath();
  await timeoutKill();
  appendAndRead();
} finally {
  rmSync(WORK, { recursive: true, force: true });
}

if (failures.length > 0) {
  process.stdout.write(`\n${String(failures.length)} 项没过：\n${failures.map((one) => `- ${one}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('\n全部通过。\n');
}
