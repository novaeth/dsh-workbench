import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderCheckTable } from '../src/check.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const README = join(ROOT, 'README.md');
const BEGIN = '<!-- dsh-wb-module:begin checks -->';
const END = '<!-- dsh-wb-module:end checks -->';

const text = readFileSync(README, 'utf8');
const begin = text.indexOf(BEGIN);
const end = text.indexOf(END);
if (begin === -1 || end === -1 || end < begin) {
  console.error('✖ README.md 缺判据表管理块；跑 `dsh-wb-module check --list --markdown` 重新生成');
  process.exit(1);
}

const actual = text.slice(begin + BEGIN.length, end).trim();
const expected = renderCheckTable();
if (actual !== expected) {
  console.error('✖ README.md 的判据表与 CHECKS 不一致；跑 `dsh-wb-module check --list --markdown` 重新生成');
  process.exit(1);
}

console.log('✔ 模块判据表与 CHECKS 一致');
