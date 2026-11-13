import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_FILE = resolve(ROOT, 'packages', 'docs', 'site', 'desktop', 'views', 'changelog.md');
const HEADING = /^##[ \t]+v?(\S+)[ \t]*$/;
const SECTION = /^##[ \t]/;

function parse(args) {
  const options = { help: false, version: undefined, file: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const [flag, inline] = args[index].split('=');
    const value = () => (inline !== undefined ? inline : (args[++index] ?? ''));
    switch (flag) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '--version':
        options.version = value();
        break;
      case '--file':
        options.file = value();
        break;
      case '--':
        break;
      default:
        throw new Error(`未知参数：${flag}`);
    }
  }
  return options;
}

function versionOf(value) {
  return String(value ?? '')
    .trim()
    .replace(/^v/, '');
}

function manifestVersion() {
  try {
    return versionOf(JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version);
  } catch {
    return '';
  }
}

function today() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function textOf(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function shownOf(file) {
  const rel = relative(ROOT, file);
  return rel === '' || rel.startsWith('..') ? file : rel;
}

function sectionOf(text, wanted) {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  const start = rows.findIndex((row) => {
    const match = HEADING.exec(row);
    return match !== null && versionOf(match[1]) === wanted;
  });
  if (start === -1) return undefined;
  let end = rows.length;
  for (let index = start + 1; index < rows.length; index += 1) {
    if (SECTION.test(rows[index])) {
      end = index;
      break;
    }
  }
  return rows.slice(start + 1, end);
}

function hasContent(rows) {
  return rows.some((row) => {
    const text = row.trim();
    return text !== '' && !text.startsWith('#') && !text.startsWith('<!--') && !/^`[^`]*`$/.test(text);
  });
}

function usage() {
  console.log(`
用法：
  node scripts/check-changelog.mjs                              检查仓库当前版本的更新日志
  node scripts/check-changelog.mjs --version 1.2.10             检查指定版本
  node scripts/check-changelog.mjs --file packages/core/CHANGELOG.md --version 1.2.10
                                                                检查指定文件

退出码：0 有这一版；1 缺这一版或这一节为空；2 参数不对。
`);
}

function main(args) {
  const options = parse(args);
  if (options.help) {
    usage();
    return 0;
  }

  const version = versionOf(options.version ?? manifestVersion());
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    console.error(`✖ 版本号要写成 x.y.z（预发布可带 -beta.1 这类后缀），收到「${version}」`);
    return 2;
  }

  const file = resolve(process.cwd(), options.file ?? DEFAULT_FILE);
  const shown = shownOf(file);
  const text = textOf(file);
  if (text === undefined) {
    console.error(`✖ 找不到更新日志：${shown}`);
    return 1;
  }

  const rows = sectionOf(text, version);
  if (rows === undefined) {
    console.error(`✖ 更新日志没有 v${version}：${shown}`);
    console.error(`  更新日志随 @dsh-workbench/core 发布，发布前必须先在文件顶部加一节：`);
    console.error('');
    console.error(`  ## v${version}`);
    console.error('');
    console.error(`  \`${today()}\``);
    console.error('');
    console.error('  ### core');
    console.error('');
    console.error('  #### ✨ 新增');
    console.error('');
    console.error('  - 改动内容，一行一条');
    return 1;
  }

  if (!hasContent(rows)) {
    console.error(`✖ 更新日志里 v${version} 这一节是空的：${shown}`);
    console.error('  标题、日期与空行不算内容；在对应标题下写改动内容，一行一条');
    return 1;
  }

  console.log(`✔ 更新日志有 v${version}：${shown}`);
  return 0;
}

let code;
try {
  code = main(process.argv.slice(2));
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  code = 2;
}
process.exitCode = code;
