import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { markdownFilesUnder, pkg, REPO } from '../lib.mjs';
import { documentedInterfaces } from '../public-types.mjs';

const SKILL_DIR = pkg('skills/workbench-module-diy');
const UNIT = pkg('src/modules/panels/unit.ts');
const PACKS = new Set([
  'manage',
  'diy-flow',
  'diy-probe',
  'diy-build',
  'diy-page',
  'diy-debug',
  'diy-record',
]);
const TITLE = '★ DIY skill 里的工具名必须是现名（含 _foo 简写），旧名/带语法的名字当场红';

export function toolNamesOf(source) {
  return new Set([...source.matchAll(/'((?:workbench_)[a-z0-9_]+)'/g)].map((one) => one[1]));
}

function typeNamesOf() {
  return new Set(documentedInterfaces().map((one) => one.name));
}

function kitNamesOf(kit) {
  const names = new Set();
  for (const bucket of Object.values(kit ?? {})) {
    if (bucket === null || typeof bucket !== 'object') continue;
    for (const name of Object.keys(bucket)) names.add(name);
  }
  return names;
}

export function codeTokensOf(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((one) => {
    const line = text.slice(0, one.index).split('\n').length;
    return { token: one[1], line };
  });
}

export function expectedToolOf(token) {
  if (PACKS.has(token)) return null;
  if (/^_[a-z][a-z0-9_]*$/.test(token)) return `workbench_diy${token}`;
  if (/^(?:panels|modules|long_tasks)_[a-z0-9_]+$/.test(token)) return `workbench_${token}`;
  if (/^workbench_[a-z0-9_]+$/.test(token)) return token;
  return undefined;
}

export function violationsOf({ text, file, toolNames, typeNames, kitNames }) {
  const found = [];
  for (const { token, line } of codeTokensOf(text)) {
    const first = token.trim().split(/\s+/)[0] ?? '';
    if (first === 'workbench_diy_surface' || first === '_surface') {
      found.push(`${file}:${line} 「${first}」把细节入口绑到 surface；改成声明/JSDoc，或只写“只读查询面”`);
      continue;
    }
    const expected = expectedToolOf(first);
    if (expected !== undefined && expected !== null) {
      if (token.trim() !== first) {
        found.push(`${file}:${line} 「${token}」不是纯名字；这里只写名字，参数/语法留给声明或工具定义`);
      } else if (!toolNames.has(expected)) {
        found.push(`${file}:${line} 「${first}」已经不在了；按现名找不到 ${expected}`);
      }
      continue;
    }
    if (typeNames.has(token) || kitNames.has(token)) continue;
  }
  return found;
}

export const checks = [
  {
    title: TITLE,
    run(ctx, report) {
      const toolNames = toolNamesOf(readFileSync(UNIT, 'utf8'));
      const typeNames = typeNamesOf();
      const kitNames = kitNamesOf(ctx.kit);
      const files = markdownFilesUnder(SKILL_DIR);
      const bad = files.flatMap((file) =>
        violationsOf({
          text: readFileSync(file, 'utf8'),
          file: relative(REPO, file),
          toolNames,
          typeNames,
          kitNames,
        }),
      );
      const dirty = violationsOf({
        text: '用 `_components` 查；`workbench_diy_surface name=<名>`；`_surface`；`_status` 在。',
        file: 'demo.md',
        toolNames: new Set(['workbench_diy_status', 'workbench_diy_surface']),
        typeNames: new Set(),
        kitNames: new Set(),
      });
      const clean = violationsOf({
        text: '用 `_status` 查。',
        file: 'demo.md',
        toolNames: new Set(['workbench_diy_status', 'workbench_diy_surface']),
        typeNames: new Set(),
        kitNames: new Set(),
      });
      const selfTest = dirty.length >= 2 && clean.length === 0;
      report(
        TITLE,
        files.length > 0 && bad.length === 0 && selfTest,
        bad.length > 0
          ? `${bad.length} 处：${bad.slice(0, 6).join('；')}${bad.length > 6 ? ' …' : ''}`
          : `${String(files.length)} 份指引 · 负例 ${String(dirty.length)} 条 / 正例 0 条`,
      );
    },
  },
];