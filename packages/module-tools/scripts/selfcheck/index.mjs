import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { sweepProbes } from '../../../../scripts/selfcheck-sweep.mjs';
import { reportAndExit } from '../../../../scripts/selfcheck-report.mjs';
import { findToolchain } from './lib.mjs';
import * as golden from './checks/golden.mjs';
import * as scaffold from './checks/scaffold.mjs';
import * as cardsShape from './checks/cards-shape.mjs';
import * as kitUsage from './checks/kit-usage.mjs';
import * as primitivesFace from './checks/primitives-face.mjs';
import * as styleShape from './checks/style-shape.mjs';
import * as declaration from './checks/declaration.mjs';
import * as cardContent from './checks/card-content.mjs';
import * as cardsNegative from './checks/cards-negative.mjs';
import * as publish from './checks/publish.mjs';
import * as release from './checks/release.mjs';
import * as changelog from './checks/changelog.mjs';
import * as negativeProbe from './checks/negative-probe.mjs';
import * as archGate from './checks/arch-gate.mjs';
import * as lintGate from './checks/lint-gate.mjs';
import * as protocol from './checks/protocol.mjs';
import * as combo from './checks/combo.mjs';
import * as discover from './checks/discover.mjs';
import * as packageFilter from './checks/package-filter.mjs';
import * as approval from './checks/approval.mjs';
import * as runtimeShape from './checks/runtime-shape.mjs';
import * as artifacts from './checks/artifacts.mjs';
import * as meta from './checks/meta.mjs';
import * as commentGate from './checks/comment-gate.mjs';
import * as seamGate from './checks/seam-gate.mjs';
import * as recipes from './checks/recipes.mjs';
import * as sites from './checks/sites.mjs';
import * as docs from './checks/docs.mjs';
import * as migrate from './checks/migrate.mjs';
import * as marketIndex from './checks/market-index.mjs';

const MODULES = [
  golden,
  scaffold,
  cardsShape,
  kitUsage,
  primitivesFace,
  styleShape,
  declaration,
  cardContent,
  cardsNegative,
  publish,
  release,
  changelog,
  negativeProbe,
  archGate,
  lintGate,
  protocol,
  combo,
  discover,
  packageFilter,
  approval,
  runtimeShape,
  artifacts,
  meta,
  commentGate,
  seamGate,
  recipes,
  sites,
  docs,
  migrate,
  marketIndex,
];

const SELF = fileURLToPath(new URL('index.mjs', import.meta.url));
const ITEM = 'WB_SELFCHECK_ITEM';
const ARGS = process.argv.slice(2);
const TIMING = ARGS.includes('--timing');

function valueOf(flag) {
  const at = ARGS.indexOf(flag);
  if (at === -1) return undefined;
  const next = ARGS[at + 1];
  return next === undefined || next.startsWith('--') ? '' : next;
}

const flat = MODULES.flatMap((module) => module.checks ?? []);
const shardable = flat.filter((check) => check.shardExcluded !== true);
const excluded = flat.filter((check) => check.shardExcluded === true);

function toolchainOf() {
  const toolchain = findToolchain();
  if (toolchain === undefined) {
    console.error('✖ 找不到一个装好依赖的模块包来借 node_modules —— 先在仓库根跑一次 pnpm install');
    process.exit(2);
  }
  return toolchain;
}

function emitItem(item) {
  console.log(ITEM + ' ' + JSON.stringify(item));
}

async function runChecks(checks, ctx, emit) {
  const results = [];
  const report = (name, passed, detail = '') => {
    results.push({ name, passed, detail });
    if (emit === 'item') {
      emitItem({ type: 'result', name, passed, detail });
      return;
    }
    console.log((passed ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''));
  };
  for (const check of checks) {
    const started = performance.now();
    try {
      const out = check.run(ctx, report);
      if (out !== undefined && typeof out.then === 'function') await out;
    } catch (error) {
      report(check.title ?? '未命名判据', false, '这条判据自己抛了：' + (error instanceof Error ? error.message : String(error)));
    }
    if (TIMING) {
      const ms = Math.round(performance.now() - started);
      const name = check.title ?? '';
      if (emit === 'item') emitItem({ type: 'timing', name, ms });
      else console.log('  · ' + ms + 'ms  ' + name);
    }
    if (emit === 'item') emitItem({ type: 'done' });
  }
  return results;
}

function autoShards() {
  return Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
}

function splitShard(value) {
  const found = /^(\d+)\/(\d+)$/.exec(value);
  if (found === null) {
    console.error('✖ --shard 要写成 <第几片>/<共几片>，例如 --shard 0/4');
    process.exit(2);
  }
  return { index: Number(found[1]), total: Number(found[2]) };
}

function shardChecks(total, index) {
  return shardable.filter((_, at) => at % total === index);
}

function runShard(index, total) {
  return new Promise((resolve) => {
    const expected = shardChecks(total, index).length;
    const results = [];
    let done = 0;
    const child = spawn(process.execPath, [SELF, '--shard', index + '/' + total, ...(TIMING ? ['--timing'] : [])], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      if (!line.startsWith(ITEM + ' ')) {
        process.stdout.write(line + '\n');
        return;
      }
      let item;
      try {
        item = JSON.parse(line.slice(ITEM.length + 1));
      } catch (error) {
        console.error('✖ 分片 ' + (index + 1) + '/' + total + ' 的输出无法解析：' + String(error));
        return;
      }
      if (item.type === 'timing') {
        if (TIMING) console.log('  · ' + item.ms + 'ms  ' + item.name);
        return;
      }
      if (item.type === 'done') {
        done += 1;
        return;
      }
      results.push({ name: item.name, passed: item.passed, detail: item.detail });
      console.log((item.passed ? '✅' : '❌') + ' ' + item.name + (item.detail ? ' — ' + item.detail : ''));
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code, signal) => {
      if (stderr !== '') process.stderr.write(stderr);
      if (done < expected) {
        results.push({
          name: '分片 ' + (index + 1) + '/' + total + ' 中断',
          passed: false,
          detail: '退出码 ' + String(code ?? signal) + '；这一片还剩 ' + (expected - done) + ' 条没跑',
        });
      }
      resolve(results);
    });
  });
}

async function shardedMain(total) {
  sweepProbes();
  const toolchain = toolchainOf();
  const results = (await Promise.all(Array.from({ length: total }, (_, index) => runShard(index, total)))).flat();
  results.push(...(await runChecks(excluded, { toolchain }, 'human')));
  reportAndExit(results);
}

async function singleMain() {
  sweepProbes();
  reportAndExit(await runChecks(flat, { toolchain: toolchainOf() }, 'human'));
}

const shardAt = valueOf('--shard');
const shardsAt = valueOf('--shards');

if (shardAt !== undefined) {
  const { index, total } = splitShard(shardAt);
  if (total < 1 || index >= total) {
    console.error('✖ --shard ' + shardAt + ' 越界：共 ' + total + ' 片时序号是 0..' + (total - 1));
    process.exit(2);
  }
  const results = await runChecks(shardChecks(total, index), { toolchain: toolchainOf() }, 'item');
  process.exitCode = results.every((one) => one.passed) ? 0 : 1;
} else if (shardsAt !== undefined) {
  const total = shardsAt === '' ? autoShards() : Number(shardsAt);
  if (!Number.isInteger(total) || total < 1 || total > 16) {
    console.error('✖ --shards 要是 1..16 的整数（收到 ' + String(shardsAt) + '）');
    process.exit(2);
  }
  if (total === 1) await singleMain();
  else await shardedMain(total);
} else {
  await singleMain();
}
