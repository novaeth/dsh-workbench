import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execa } from 'execa';
import { GATE_STEPS } from './gate/steps.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TAIL = 6000;

const HELP = [
  '用法：node scripts/gate.mjs [选项]',
  '',
  '默认执行所有步骤：互不依赖的判据不会在第一个失败处停，最后列出失败清单与各自的输出末尾。',
  '',
  '  --only <名字[,名字]>  只执行这几条（按步骤表顺序；没选中的依赖视为满足）',
  '  --fail-fast           第一个失败就停',
  '  --list                列出步骤与依赖',
  '  --help                显示本说明',
].join('\n');

function parse() {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      allowPositionals: false,
      options: {
        only: { type: 'string' },
        'fail-fast': { type: 'boolean', default: false },
        list: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false, short: 'h' },
      },
    }).values;
  } catch (error) {
    console.error('✖ ' + (error instanceof Error ? error.message : String(error)));
    console.error(HELP);
    process.exit(2);
  }
}

function labelOf(step) {
  return step.args === undefined || step.args.length === 0 ? step.name : step.name + ' ' + step.args.join(' ');
}

function selected(only) {
  if (only === undefined) return GATE_STEPS;
  const wanted = only.split(',').map((one) => one.trim()).filter((one) => one !== '');
  if (wanted.length === 0) {
    console.error('✖ --only 后面要跟步骤名，例如 --only lint,check:docs');
    process.exit(2);
  }
  const known = new Set(GATE_STEPS.map((step) => step.name));
  const unknown = wanted.filter((name) => !known.has(name));
  if (unknown.length > 0) {
    console.error('✖ 没有这些步骤：' + unknown.join('、'));
    process.exit(2);
  }
  return GATE_STEPS.filter((step) => wanted.includes(step.name));
}

function list() {
  for (const step of GATE_STEPS) {
    const needs = step.needs === undefined || step.needs.length === 0 ? '' : '（依赖 ' + step.needs.join('、') + '）';
    console.log(labelOf(step) + needs);
  }
}

async function runStep(step) {
  const command = step.node === true ? process.execPath : 'pnpm';
  const args =
    step.node === true ? [step.name] : ['run', step.name, ...(step.args === undefined ? [] : ['--', ...step.args])];
  console.log('\n▶ ' + labelOf(step));
  const started = performance.now();
  let tail = '';
  try {
    const child = execa(command, args, {
      cwd: ROOT,
      env: process.env,
      reject: false,
      buffer: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      tail = (tail + chunk).slice(-TAIL);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      tail = (tail + chunk).slice(-TAIL);
    });
    const result = await child;
    return { status: result.exitCode === 0 ? 'pass' : 'fail', ms: Math.round(performance.now() - started), tail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('✖ ' + step.name + ' 启动失败：' + message);
    return { status: 'fail', ms: Math.round(performance.now() - started), tail: (tail + '\n' + message).trim() };
  }
}

function mark(status) {
  if (status === 'pass') return '✔';
  if (status === 'fail') return '✖';
  return '○';
}

function seconds(ms) {
  return (ms / 1000).toFixed(1) + 's';
}

function summary(rows, stopped, explicit) {
  const failed = rows.filter((row) => row.status === 'fail');
  const skipped = rows.filter((row) => row.status === 'skip');
  console.log('\n=== 门禁结果 ===');
  for (const row of rows) {
    const detail = row.detail === undefined ? '' : '（' + row.detail + '）';
    console.log(mark(row.status) + ' ' + row.name + ' · ' + seconds(row.ms) + detail);
  }
  if (stopped) console.log('（--fail-fast：后面的步骤没有执行）');
  if (skipped.length > 0) console.log('跳过 ' + skipped.length + ' 条：依赖没有通过，不代表通过。');
  if (failed.length === 0) {
    console.log('\n全部通过');
    return;
  }
  if (explicit) console.log('（--only：没在列表里的依赖视为满足）');
  console.log('\n' + failed.length + ' 项失败：');
  for (const row of failed) {
    console.log('\n── ' + row.name + ' ──');
    const text = row.tail.trim();
    console.log(text === '' ? '（没有输出）' : text);
  }
  process.exitCode = 1;
}

async function main() {
  const values = parse();
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values.list) {
    list();
    return;
  }
  const explicit = values.only !== undefined;
  const steps = selected(values.only);
  const inRun = new Set(steps.map((step) => step.name));
  const rows = [];
  const status = new Map();
  let stopped = false;
  for (const step of steps) {
    const needs = step.needs === undefined ? [] : step.needs;
    const missing = needs.filter((name) => inRun.has(name) && status.get(name) !== 'pass');
    if (missing.length > 0) {
      rows.push({ name: step.name, status: 'skip', ms: 0, detail: '依赖 ' + missing.join('、') + ' 未通过' });
      status.set(step.name, 'skip');
      console.log('\n○ ' + labelOf(step) + ' —— 未运行：' + missing.join('、') + ' 未通过');
      continue;
    }
    const result = await runStep(step);
    rows.push({ name: step.name, status: result.status, ms: result.ms, tail: result.tail });
    status.set(step.name, result.status);
    console.log(mark(result.status) + ' ' + step.name + ' · ' + seconds(result.ms));
    if (result.status === 'fail' && values['fail-fast']) {
      stopped = true;
      break;
    }
  }
  summary(rows, stopped, explicit);
}

await main();
