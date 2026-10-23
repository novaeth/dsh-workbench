#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from '../src/build.mjs';
import { CHECKS, check } from '../src/check.mjs';
import { design } from '../src/design.mjs';
import { init } from '../src/init.mjs';
import { publish } from '../src/publish.mjs';
import { sync } from '../src/sync.mjs';

async function lint({ root, args }) {
  const [{ CONFIG_FILE, lintPackage }, { discoverModulePackages }] = await Promise.all([
    import('../src/checks/lint.mjs'),
    import('../src/discover.mjs'),
  ]);
  const fix = args.includes('--fix');
  const modulePackages = discoverModulePackages({ root });
  const declared = modulePackages.filter((pkg) => existsSync(join(pkg.dir, CONFIG_FILE)));
  if (declared.length === 0) {
    console.log(`没有模块包带 ${CONFIG_FILE}（模块包 ${modulePackages.length} 个）—— 没什么可 lint 的。`);
    return;
  }

  let failed = 0;
  for (const pkg of declared) {
    const result = await lintPackage(pkg, { fix });
    if (result.error !== undefined) {
      console.error(`✖ ${result.error}`);
      failed += 1;
      continue;
    }
    const fixed = fix ? `（修了 ${result.fixed} 条 / 还剩 ${result.errors + result.warnings} 条）` : '';
    console.log(
      `${result.errors > 0 ? '✖' : '✔'} ${result.name}：${result.files} 个文件 · ` +
        `${result.errors} error · ${result.warnings} warn${fixed}`,
    );
    for (const problem of result.problems) console.log(`  · ${problem}`);
    for (const warning of result.warnLines) console.log(`  · ${warning}`);
    if (result.errors > 0) failed += 1;
  }
  if (failed > 0) process.exit(1);
}

const [command, ...rest] = process.argv.slice(2);
const cwd = process.env.DSH_WB_MODULE_CWD ?? process.cwd();

const commands = { build, check, init, design, publish, sync, lint };

if (!command || !commands[command]) {
  console.error(`用法：dsh-wb-module <build|check|init|design|publish|sync|lint> [--cwd <目录>]
      dsh-wb-module check [--only ${Object.keys(CHECKS).join('|')}]
      dsh-wb-module check --only kit                 # 单跑当查询口：这份外壳的 kit 里有什么（--file <名字> 给类型文件绝对路径）
      dsh-wb-module check --only primitives [--all|--files|--json]
                                                     # 单跑当查询口：dsh 原语里有什么 + --file <名字> 给类型文件绝对路径
      dsh-wb-module init <unit> [--dir <目录>] [--template minimal|diy] [--description <文字>]
      dsh-wb-module design <init|check|render|accept>   # 三张表：填、查空格、生成 README、自验打勾
      dsh-wb-module sync                                 # 按清单生成 src/declared-tools.ts（工具名只有清单一处写者）
      dsh-wb-module lint [--fix]                         # 模块自己那份 eslint.config.mjs；--fix 写回文件
      dsh-wb-module publish                              # 发货前的清单：门禁 + npm pack 清单 + files 漏项（只 dry run）`);
  process.exit(2);
}

const value = (flag) => {
  const at = rest.indexOf(flag);
  return at === -1 ? undefined : rest[at + 1];
};
const args = [];
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i] === '--cwd' || rest[i] === '--only') {
    i += 1;
    continue;
  }
  args.push(rest[i]);
}

const root = resolve(value('--cwd') ?? cwd);
if (root !== process.cwd()) process.chdir(root);

await commands[command]({ root, only: value('--only'), args });
