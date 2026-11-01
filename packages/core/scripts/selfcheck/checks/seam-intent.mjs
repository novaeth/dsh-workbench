import { join, relative } from 'node:path';
import { REPO, SHARED_SRC, SRC, read, walk } from '../lib.mjs';

const RAW_TITLE = '★ 执行缝只有一条路';
const INTENT_TITLE = '★ 每次执行缝调用都声明写入域';
const SWALLOW_TITLE = '★ 沙箱拒绝不被吞';
const ROOT_TITLE = '★ 产品数据根只有一份算法';

const ADAPTERS = [
  'adapter-runtime',
  'adapter-probe',
  'adapter-supply',
  'adapter-profile',
  'adapters-default',
  'adapters-chrome-mcp',
].map((name) => join(REPO, 'packages', name, 'src'));

const SEAM_OWN = ['packages/shared/src/host/shell.ts', 'packages/shared/src/host/seam/'];
const ROOT_OWN = ['packages/shared/src/host/data-root.ts'];

const rel = (file) => relative(REPO, file).split('\\').join('/');
const allowed = (file, prefixes) => prefixes.some((prefix) => rel(file) === prefix || rel(file).startsWith(prefix));

function hostFiles() {
  const roots = [SRC, SHARED_SRC, ...ADAPTERS];
  const out = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) out.push(file);
    }
  }
  return out;
}

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

function braceText(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return source.slice(open);
}

const CALL = /\b([A-Za-z_$][\w$]*(?:\([^()]*\))?)\s*\.\s*run\(\s*\{/g;

function seamCalls(source) {
  const out = [];
  for (const match of source.matchAll(CALL)) {
    if (!/seam/i.test(match[1])) continue;
    const open = (match.index ?? 0) + match[0].length - 1;
    const text = braceText(source, open);
    out.push({ at: match.index ?? 0, text, tail: source.slice(open + text.length, open + text.length + 60) });
  }
  return out;
}

export function rawShellHits() {
  const hits = [];
  for (const file of hostFiles()) {
    if (allowed(file, SEAM_OWN)) continue;
    const source = read(file);
    for (const pattern of [/\brunShell\s*\(/, /\bshellOf\s*\(/, /\bwithSandboxPolicy\s*\(/]) {
      const match = pattern.exec(source);
      if (match !== null) hits.push(`${rel(file)}:${String(lineOf(source, match.index))}`);
    }
  }
  return hits;
}

export function intentHits() {
  const hits = [];
  for (const file of hostFiles()) {
    if (allowed(file, ['packages/shared/src/host/seam/'])) continue;
    const source = read(file);
    for (const call of seamCalls(source)) {
      if (!/\bintent\b/.test(call.text)) hits.push(`${rel(file)}:${String(lineOf(source, call.at))} 缺 intent`);
    }
  }
  return hits;
}

export function swallowHits() {
  const hits = [];
  for (const file of hostFiles()) {
    const source = read(file);
    for (const call of seamCalls(source)) {
      if (call.tail.includes('.catch(') && !/\bbestEffort\s*:\s*true/.test(call.text)) {
        hits.push(`${rel(file)}:${String(lineOf(source, call.at))} 吞掉拒绝`);
      }
    }
  }
  return hits;
}

export function productRootHits() {
  const hits = [];
  const patterns = [
    /(?:homePath|dshHomePath)\(\s*['"]workbench/,
    /join\(\s*dshHome\(\)\s*,\s*['"]workbench['"]/,
    /join\(\s*dshHome\s*,\s*['"]workbench['"]/,
  ];
  for (const file of hostFiles()) {
    if (allowed(file, ROOT_OWN)) continue;
    const source = read(file);
    for (const pattern of patterns) {
      const match = pattern.exec(source);
      if (match !== null) hits.push(`${rel(file)}:${String(lineOf(source, match.index))}`);
    }
  }
  return hits;
}

function reportOne(report, title, gaps, okText) {
  report(title, gaps.length === 0, gaps.length === 0 ? okText : gaps.slice(0, 6).join('、'));
}

export const checks = [
  {
    title: RAW_TITLE,
    run(_ctx, report) {
      reportOne(report, RAW_TITLE, rawShellHits(), '底层执行缝只在执行缝模块内部');
    },
  },
  {
    title: INTENT_TITLE,
    run(_ctx, report) {
      reportOne(report, INTENT_TITLE, intentHits(), '每次调用都带写入域');
    },
  },
  {
    title: SWALLOW_TITLE,
    run(_ctx, report) {
      reportOne(report, SWALLOW_TITLE, swallowHits(), '拒绝都有去处');
    },
  },
  {
    title: ROOT_TITLE,
    run(_ctx, report) {
      reportOne(report, ROOT_TITLE, productRootHits(), '产品域根只由 data-root 算');
    },
  },
];
