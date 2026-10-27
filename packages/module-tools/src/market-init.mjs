import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execaSync } from 'execa';

import { MarketIndexError, initializeMarketRepo } from './market-index.mjs';

function argValue(args, flag) {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

function targetOf(args) {
  const takesValue = new Set(['--ref', '--path']);
  for (let index = 0; index < args.length; index += 1) {
    const one = args[index];
    if (takesValue.has(one)) {
      index += 1;
      continue;
    }
    if (!one.startsWith('--')) return one;
  }
  return undefined;
}

function exec(command, argv, options = {}) {
  const result = execaSync(command, argv, { cwd: options.cwd, reject: false, stdio: 'pipe' });
  return { status: result.exitCode ?? 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function shortSha(sha) {
  return typeof sha === 'string' && sha.length >= 7 ? sha.slice(0, 7) : sha;
}

export async function marketInit({ args }) {
  const target = targetOf(args);
  if (target === undefined) {
    console.error('✖ 用法：dsh-wb-module market-init <git 地址|目录> [--ref <分支>] [--path <索引路径>] [--no-readme] [--json]');
    process.exit(2);
  }
  const json = args.includes('--json');
  const ref = argValue(args, '--ref');
  const indexPath = argValue(args, '--path');
  const isDir = existsSync(resolve(target));
  const configured = process.env.DSH_HOME?.trim() ?? '';
  const home = configured === '' ? join(homedir(), '.dsh') : configured;
  try {
    const result = initializeMarketRepo({
      exec,
      home,
      ...(isDir ? { dir: resolve(target) } : { url: target }),
      ...(ref === undefined ? {} : { ref }),
      ...(indexPath === undefined ? {} : { indexPath }),
      readme: !args.includes('--no-readme'),
    });
    if (json) {
      console.log(JSON.stringify(result));
      return;
    }
    if (result.changed) {
      console.log(`✔ 市场索引已初始化：${result.url}`);
      console.log(`  分支：${result.branch} · commit：${shortSha(result.commit)}`);
      console.log(`  写了：${result.created.join('、')}`);
      console.log('  下一步：在工作台「模块市场 → 发现」里添加这个地址');
      if (result.firstBranch) {
        console.log(`  提示：这是空仓库的第一个分支；如果 ${result.branch} 不是仓库默认分支，去仓库设置里把默认分支改成它`);
      }
      return;
    }
    console.log(`✔ 市场索引已就绪：${result.url}`);
    console.log(`  分支：${result.branch} · HEAD：${shortSha(result.commit)} —— 没改动`);
  } catch (error) {
    if (error instanceof MarketIndexError) {
      console.error(`✖ ${error.message}`);
      if (error.command !== undefined) console.error(`  ${error.command}`);
      process.exit(1);
    }
    throw error;
  }
}
