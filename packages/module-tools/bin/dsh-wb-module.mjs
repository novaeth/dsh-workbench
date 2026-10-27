#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Command } from 'commander';
import { build } from '../src/build.mjs';
import { CHECKS, check } from '../src/check.mjs';
import { changelog } from '../src/changelog.mjs';
import { design } from '../src/design.mjs';
import { init } from '../src/init.mjs';
import { marketInit } from '../src/market-init.mjs';
import { publish } from '../src/publish.mjs';
import { release } from '../src/release.mjs';
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

const commands = { build, check, init, 'market-init': marketInit, design, publish, release, sync, lint, changelog };

const CHECK_HELP = `
查询口：
  check --only kit [--file <名字>]                      这份外壳的 kit 里有什么
  check --only primitives [--all|--files|--json] [--file <名字>]
                                                        这份外壳的 dsh 原语里有什么
  check --list [--json|--markdown]                      只列判据元数据`;

const RELEASE_HELP = `
选项：
  --target team|public|tarball|git|market|local         出口；省略按配置默认（可写索引优先 market）
  --version patch|minor|major|x.y.z                     版本；省略时已存在就自动 patch
  --registry <url> --access restricted|public --npmrc <文件>
  --license <id> --out <目录> --git <remote>
  --author <署名>                                       换署名（姓名，或 姓名 <邮箱>）；写回 package.json
  --changelog-note <文字> --changelog-type added|changed|fixed|removed|security|deprecated
                                                        这一版还没有更新日志时写进 CHANGELOG.md（文件不在先建）
  --index auto|none|<目录|git 地址>                     发布后要更新的索引源
  --index-source <id> --index-ref <分支> --index-path <索引路径> --index-policy artifacts-in-repo|catalog-only
  --resume                                              上次中断后接着发（用记录里的出口与版本）
  --dry-run --verify --yes --json`;

const MARKET_INIT_HELP = `
用法：
  market-init <git 地址|目录> [--ref <分支>] [--path <索引路径>] [--no-readme] [--json]

空仓库：用仓库自己声明的默认分支，读不到时用 --ref 指定（github.com 兜底 main）。
已有 commit 的仓库：只补 market.json / README.md，不改已有文件。`;

const CHANGELOG_HELP = `
用法：
  changelog check [版本] [--json]

版本省略时用 package.json 里的 version。发布时这一版必须有记录：
release --changelog-note "这一版改了什么"（文件不在会先建）。`;

const COMMANDS = {
  build: '出 dist/host.js（单文件 ESM）与 client.js（套 loader 壳）',
  check: '十三条判据；--only 单跑，也当查询口用；--list 只列判据元数据',
  init: '建模块骨架（--dir / --template minimal|diy / --description）',
  'market-init': '初始化市场索引仓库（写 market.json + README，推首个 commit）',
  design: '设计底稿：init 填 / check 查空格 / render 生成 README / accept 打勾',
  publish: '发货前清单：门禁 + files + npm pack（只 dry run）',
  release: '真发布：全门禁 + 验收闸 + 预检接管 + 发到出口 + 发后核包 + 更新市场索引（中断可 --resume）',
  sync: '按清单生成 src/declared-tools.ts，按 design.json 生成 src/datasource.ts',
  lint: '用模块自己那份 eslint.config.mjs；--fix 写回文件',
  changelog: '更新日志：check 查这一版有没有；发布时用 release --changelog-note 写进去',
};

function flagValue(raw, flag) {
  const at = raw.indexOf(flag);
  return at === -1 ? undefined : raw[at + 1];
}

async function dispatch(name, raw) {
  const cwd = process.env.DSH_WB_MODULE_CWD ?? process.cwd();
  const args = [];
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === '--cwd' || raw[index] === '--only') {
      index += 1;
      continue;
    }
    args.push(raw[index]);
  }
  const root = resolve(flagValue(raw, '--cwd') ?? cwd);
  if (root !== process.cwd()) process.chdir(root);
  await commands[name]({ root, only: flagValue(raw, '--only'), args });
}

const program = new Command('dsh-wb-module')
  .description(`模块包的工具链：${Object.keys(COMMANDS).join(' / ')}`)
  .helpOption('-h, --help', '打印帮助')
  .addHelpText(
    'after',
    '\n  --cwd <目录>  指定包目录（默认当前目录；也可用 DSH_WB_MODULE_CWD）\n  任何命令后跟 --help 都只打印帮助。\n',
  );

for (const [name, description] of Object.entries(COMMANDS)) {
  const sub = program
    .command(name)
    .description(description)
    .helpOption('-h, --help', '打印帮助')
    .allowUnknownOption(true)
    .allowExcessArguments(true);
  if (name === 'check') sub.addHelpText('after', `\n${CHECK_HELP}\n      --only 可选：${Object.keys(CHECKS).join('|')}\n`);
  if (name === 'release') sub.addHelpText('after', `${RELEASE_HELP}\n`);
  if (name === 'market-init') sub.addHelpText('after', `${MARKET_INIT_HELP}\n`);
  if (name === 'changelog') sub.addHelpText('after', `${CHANGELOG_HELP}\n`);
  sub.action(async (_options, command) => {
    await dispatch(name, command.args);
  });
}

await program.parseAsync(process.argv);
