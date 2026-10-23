import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DESIGN_FILE } from './design.mjs';

const CLI = fileURLToPath(new URL('../bin/dsh-wb-module.mjs', import.meta.url));

function runCli(root, argv) {
  try {
    execFileSync(process.execPath, [CLI, ...argv, '--cwd', root], { stdio: 'inherit' });
  } catch {
    console.error(`✖ ${argv.join(' ')} 没过 —— 清单先不打印了，把上面那些红字处理掉`);
    process.exit(1);
  }
}

function readManifest(root) {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
}

function packList(root) {
  const cache = join(tmpdir(), 'dsh-wb-pack-cache');

  const raw = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', cache], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const start = raw.search(/[[{]/);
  if (start === -1) throw new Error(`npm pack 没有输出 JSON：${raw.slice(0, 200)}`);
  const parsed = JSON.parse(raw.slice(start));
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

const normalize = (one) => String(one).replace(/^\.\//, '');

export async function publish({ root }) {
  if (!existsSync(join(root, 'package.json'))) {
    console.error(`✖ ${root} 里没有 package.json —— 这不是一个包目录`);
    process.exit(2);
  }
  const manifest = readManifest(root);
  const unit = manifest?.dsh?.workbench?.unit;
  const isModule = typeof unit === 'string' && unit !== '';

  if (isModule) {

    runCli(root, ['build']);
    runCli(root, ['check']);
    if (existsSync(join(root, DESIGN_FILE))) runCli(root, ['design', 'check']);
    else console.log('○ 没有 design.json（三张表还没落成机器形状）—— 建议先 dsh-wb-module design init');
  } else {
    console.log('○ 这不是一个 wb 模块包（没有 dsh.workbench.unit）—— 跳过判据，只查打包清单');
  }

  const packed = packList(root);
  const paths = (packed.files ?? []).map((one) => normalize(one.path));
  const declared = Array.isArray(manifest.files) ? manifest.files.map(normalize) : [];
  const problems = [];

  const artifacts = Object.values(manifest.exports ?? {})
    .filter((one) => typeof one === 'string')
    .map(normalize)
    .filter((one) => one !== '' && !one.endsWith('.css'));
  for (const one of artifacts) {
    if (!paths.includes(one)) problems.push(`exports 里的 ${one} 不在包里（files 少带了它）`);
  }

  if (isModule && !paths.includes('cordis.patch.yml')) {
    problems.push('cordis.patch.yml 不在包里 —— 模块是靠它插进 dsh 组合的');
  }

  const templateDirs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('template'))
    .map((entry) => entry.name);
  for (const one of templateDirs) {
    if (!declared.includes(one)) problems.push(`模板目录 ${one}/ 不在 files 里（init --template 会当场找不到它）`);
  }

  const readmeOnDisk = existsSync(join(root, 'README.md'));
  if (readmeOnDisk && !paths.includes('README.md')) problems.push('README.md 在盘上却没进包');
  if (!readmeOnDisk) console.log('○ 包根下没有 README.md —— 发出去的包在源上会是一页空白，建议补一份');

  const inTemplate = (one) => templateDirs.some((dir) => one.startsWith(`${dir}/`));
  const leftovers = paths.filter((one) => !inTemplate(one) && (one.endsWith('.tpl') || one.includes('.init-')));
  if (leftovers.length > 0) problems.push(`包里混进了不该发的东西：${leftovers.slice(0, 3).join('、')}`);

  for (const one of declared) {
    const hit = paths.some((path0) => path0 === one || path0.startsWith(`${one}/`));
    if (!hit) problems.push(`files 里声明了 ${one}，但包里没有它（声明与产物不一致）`);
  }

  const listed = packed.entryCount ?? paths.length;
  console.log(
    `打包清单：${listed} 个文件 · ${(packed.size / 1024).toFixed(1)} KB（解包 ${(packed.unpackedSize / 1024).toFixed(1)} KB）`,
  );
  for (const one of paths.slice(0, 12)) console.log(`  · ${one}`);
  if (listed > 12) console.log(`  … 还有 ${listed - 12} 个`);

  if (problems.length > 0) {
    console.error(`✖ 发货前清单 ${problems.length} 条不过：`);
    for (const one of problems) console.error(`  · ${one}`);
    process.exit(1);
  }

  if (manifest.private === true) {
    console.log('✔ 清单干净。包是 `private: true` —— **不会**发到任何源（DIY 的模块都该这样）。');
    console.log(`  要给别人用：摘掉 private + 写上发布目标，再自己跑 \`npm publish\`（这条命令不会替你发）。`);
    return;
  }
  console.log('✔ 清单干净。真要发就自己跑（凭据在你手上）：');
  console.log(`  npm publish${manifest.publishConfig?.registry === undefined ? '' : ` --registry ${manifest.publishConfig.registry}`}`);
  console.log(`  包目录：${relative(process.cwd(), root) === '' ? '.' : relative(process.cwd(), root)}`);
}
