import { join, relative } from 'node:path';
import { REPO, SHARED_SRC, SRC, read, walk } from '../lib.mjs';

const RAW_TITLE = '★ 执行缝只有一条路';
const INTENT_TITLE = '★ 每次执行缝调用都声明写入域';
const SWALLOW_TITLE = '★ 沙箱拒绝不被吞';
const ROOT_TITLE = '★ 产品数据根只有一份算法';
const EXEC_TITLE = '★ 起进程只有一个入口';
const HOST_TITLE = '★ 宿主能力只在宿主接线里打开';
const WRITE_TITLE = '★ 宿主文件写只有一个入口';

const ADAPTERS = [
  'adapter-runtime',
  'adapter-probe',
  'adapter-supply',
  'adapter-profile',
  'adapters-default',
  'adapters-chrome-mcp',
].map((name) => join(REPO, 'packages', name, 'src'));

const SEAM_OWN = ['packages/shared/src/host/shell.ts', 'packages/shared/src/host/seam/run.ts'];
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

const CALL = /\b([A-Za-z_$][\w$]*(?:\([^()]*\))?)\s*\.\s*(?:run|spawn|open)\(\s*\{/g;

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

const EXEC_OWN = ['packages/shared/src/host/seam/process.ts'];

export function execEntryHits() {
  const hits = [];
  const patterns = [
    /^\s*import[^\n]*from\s+['"]execa['"]/m,
    /^\s*import[^\n]*from\s+['"]node:child_process['"]/m,
    /require\s*\(\s*['"]node:child_process['"]\s*\)/,
    /\bexeca(?:Sync)?\s*\(/,
  ];
  for (const file of hostFiles()) {
    if (allowed(file, EXEC_OWN)) continue;
    const source = read(file);
    for (const pattern of patterns) {
      const match = pattern.exec(source);
      if (match !== null) hits.push(`${rel(file)}:${String(lineOf(source, match.index))}`);
    }
  }
  return hits;
}

const WRITE_ENTRY = 'packages/shared/src/host/fs-write.ts';
const WRITE_CALL_OWN = [
  'packages/adapter-probe/src/self-update.ts',
  'packages/shared/src/host/lib-capabilities.ts',
];

export function writeEntryHits() {
  const hits = [];
  for (const file of hostFiles()) {
    if (allowed(file, [WRITE_ENTRY])) continue;
    const source = read(file);
    const importMatch = /^\s*import[^\n]*from\s+['"]write-file-atomic['"]/m.exec(source);
    if (importMatch !== null) hits.push(`${rel(file)}:${String(lineOf(source, importMatch.index))}`);
    if (allowed(file, WRITE_CALL_OWN)) continue;
    const callMatch = /\b(writeFileAtomic|writeFileSync|writeBytesFileSync)\b/.exec(source);
    if (callMatch !== null) hits.push(`${rel(file)}:${String(lineOf(source, callMatch.index))}`);
  }
  return hits;
}

export function hostCapabilityHits() {
  const hits = [];
  const allowHostFiles = ['packages/core/src/shared/api/host/workbench-seam.ts', 'packages/shared/src/host/seam/'];
  for (const file of hostFiles()) {
    if (allowed(file, allowHostFiles)) continue;
    const source = read(file);
    const match = /\ballowHost\b/.exec(source);
    if (match !== null) hits.push(`${rel(file)}:${String(lineOf(source, match.index))}`);
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
  {
    title: EXEC_TITLE,
    run(_ctx, report) {
      reportOne(report, EXEC_TITLE, execEntryHits(), 'run / spawn / open 是宿主侧唯一的起进程入口');
    },
  },
  {
    title: HOST_TITLE,
    run(_ctx, report) {
      reportOne(report, HOST_TITLE, hostCapabilityHits(), 'allowHost 只在宿主接线与执行缝内部出现');
    },
  },
  {
    title: WRITE_TITLE,
    run(_ctx, report) {
      reportOne(report, WRITE_TITLE, writeEntryHits(), '原子写只走 fs-write 的 writeTextFile / writeJsonFile / writeBytesFile');
    },
  },
];
