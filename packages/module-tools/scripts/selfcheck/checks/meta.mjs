import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { CHECKS } from '../../../src/check.mjs';
import { PKG_ROOT, read } from '../lib.mjs';

const checksDir = join(PKG_ROOT, 'src', 'checks');
const checkFiles = readdirSync(checksDir)
  .filter((name) => name.endsWith('.mjs'))
  .sort();

const CHECK_HELPERS = new Set(['shell-artifact.mjs']);

const STATES_LINE = "const STATES = ['pass', 'fail', 'skip'];";

export const checks = [
  {
    title: '判据的形状：都导出 run() + 三态结果（没有 process.exit、没有 console.）',
    async run(_ctx, report) {

      const problems = [];
      for (const name of checkFiles) {
        const text = read(join(checksDir, name));
        if (CHECK_HELPERS.has(name)) {
          if (/export\s+async\s+function\s+run\s*\(/.test(text)) {
            problems.push(`${name}: 是取件助手，却导出了 run() —— 要么登记进 CHECKS，要么别叫助手`);
          }
          continue;
        }
        if (!/export\s+async\s+function\s+run\s*\(/.test(text)) problems.push(`${name}: 没有导出 async function run()`);
        if (text.includes('process.exit')) problems.push(`${name}: 还留着 process.exit —— 退出码只归聚合层`);
        if (/console\./.test(text)) problems.push(`${name}: 还留着 console. —— 打印只归聚合层`);
      }
      const aggregatorText = read(join(PKG_ROOT, 'src', 'check.mjs'));
      if (!aggregatorText.includes(STATES_LINE)) problems.push(`src/check.mjs 里没有三态声明：${STATES_LINE}`);

      const registered = Object.keys(CHECKS);
      for (const name of registered) {
        const file = `${name}.mjs`;
        if (!checkFiles.includes(file)) {
          problems.push(`CHECKS 里的 ${name} 没有对应的 src/checks/${file}`);
          continue;
        }
        const moduleTitle = (await import(new URL(`../../../src/checks/${file}`, import.meta.url))).title;
        if (moduleTitle !== CHECKS[name].title) {
          problems.push(`${file} 导出的 title「${moduleTitle}」与 CHECKS 表里的「${CHECKS[name].title}」不一致`);
        }
      }
      for (const file of checkFiles) {
        if (CHECK_HELPERS.has(file)) continue;
        if (!registered.includes(file.slice(0, -'.mjs'.length))) {
          problems.push(`src/checks/${file} 没有登记进 src/check.mjs 的 CHECKS`);
        }
      }
      report(
        `${checkFiles.length - CHECK_HELPERS.size} 条判据都是"导出 run() + 三态结果"：没有 process.exit、没有 console.，` +
          `check.mjs 三态齐全、表与 title 都对得上（另有 ${CHECK_HELPERS.size} 个取件助手住在 src/checks/ 下）`,
        problems.length === 0,
        problems.join('、'),
      );
    },
  },
  {
    title: '打包清单：包根下每个 template* 目录都在 files 里',
    run(_ctx, report) {

      const pkgManifest = JSON.parse(read(join(PKG_ROOT, 'package.json')));
      const shipped = new Set(Array.isArray(pkgManifest.files) ? pkgManifest.files : []);
      const templateDirs = readdirSync(PKG_ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('template'))
        .map((entry) => entry.name)
        .sort();
      const notShipped = templateDirs.filter((name) => !shipped.has(name));
      report(
        `打包清单：${templateDirs.length} 个 template* 目录都在 files 里（${templateDirs.join('、')}）`,
        notShipped.length === 0,
        notShipped.length ? `没写进 files：${notShipped.join('、')}` : '',
      );
    },
  },
];
