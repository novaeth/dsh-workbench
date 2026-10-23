import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import ts from 'typescript';
import { dirname, join, relative, resolve } from 'node:path';
import { discoverModulePackages } from '../discover.mjs';
import { isSeedSpecifier } from '../seed.mjs';
import { LIB_CAPABILITIES, importsPreferred } from '@dsh-workbench/shared/host';

const IMPORT = /from\s*'([^']+)'|import\s*\(?\s*'([^']+)'/g;

const SHARED_FROM =
  /(?:^|[;}\s])(import|export)\s+(type\s+)?([^'";]{0,600}?)\s*from\s*['"](@dsh-workbench\/shared(?:\/host)?)['"]/g;

const SHARED_DYNAMIC = /import\s*\(\s*['"](@dsh-workbench\/shared(?:\/host)?)['"]/g;

function typeOnlyOf(keyword, clause) {
  if (keyword !== undefined) return true;
  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (braces === null) return false;
  if (clause.slice(0, braces.index).replace(/[,\s]/g, '') !== '') return false;
  const parts = braces[1]
    .split(',')
    .map((one) => one.trim())
    .filter((one) => one !== '');
  return parts.length > 0 && parts.every((one) => one.startsWith('type '));
}

const SIDE_TEXT = {
  client: '客户端侧可达',
  host: '宿主侧可达',
  both: '两个入口都到得了',
  orphan: '两个入口都到不了（可能是死代码）',
};

const COMMENT_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css']);
const COMMENT_DIRECTIVE = /^(?:\/\/|\/\*)\s*(?:!?\s*@(?:license|preserve)\b|eslint-(?:disable|enable)\b|@ts-(?:ignore|expect-error|nocheck|check)\b|@vitest-|@jest-|@flow\b|@jsx|prettier-ignore\b|global\b|exported\b|c8\b|v8\b|istanbul\b|#\s*sourceMappingURL\b|@__PURE__|#__PURE__|\/?\s*<reference\b)/u;

function codeFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      codeFiles(full, acc);
      continue;
    }
    const ext = entry.name.slice(entry.name.lastIndexOf('.'));
    if (COMMENT_EXT.has(ext)) acc.push(full);
  }
  return acc;
}

function tsCommentRanges(text) {
  const source = ts.createSourceFile('scan.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  const add = (ranges) => {
    for (const range of ranges ?? []) found.set(range.pos, range);
  };
  const visit = (node) => {
    add(ts.getLeadingCommentRanges(text, node.getFullStart()));
    add(ts.getTrailingCommentRanges(text, node.getEnd()));
    ts.forEachChild(node, visit);
  };
  visit(source);
  add(ts.getLeadingCommentRanges(text, 0));
  add(ts.getTrailingCommentRanges(text, text.length));
  return [...found.values()].sort((a, b) => a.pos - b.pos);
}

function cssCommentRanges(text) {
  const found = [];
  let at = 0;
  let quote = null;
  while (at < text.length) {
    const ch = text[at];
    if (quote !== null) {
      if (ch === '\\') at += 2;
      else {
        if (ch === quote) quote = null;
        at += 1;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      at += 1;
      continue;
    }
    if (ch === '/' && text[at + 1] === '*') {
      const end = text.indexOf('*/', at + 2);
      if (end === -1) break;
      found.push({ pos: at, end: end + 2 });
      at = end + 2;
      continue;
    }
    at += 1;
  }
  return found;
}

export function commentViolationsOf(text, { css = false } = {}) {
  const ranges = css ? cssCommentRanges(text) : tsCommentRanges(text);
  const bad = [];
  for (const range of ranges) {
    const raw = text.slice(range.pos, range.end);
    if (!css && COMMENT_DIRECTIVE.test(raw)) continue;
    bad.push(text.slice(0, range.pos).split('\n').length);
  }
  return bad;
}

function sharedProblem(name, rel, specifier, side, dynamic) {
  const what = dynamic ? `动态 import 了 ${specifier}` : `从 ${specifier} 取了运行值`;
  if (specifier === '@dsh-workbench/shared') {
    const fix =
      side === 'host'
        ? '宿主侧改从 @dsh-workbench/shared/host 引'
        : side === 'client'
          ? '浏览器侧改从 kit（@dsh-workbench/core/client）引；kit 里没有的，先看它是不是该补进 kit'
          : side === 'both'
            ? '这个文件两个入口都到得了：宿主要的走 /host、浏览器要的走 kit —— 两边的运行值挤在一个文件里就拆开'
            : '这个文件两个入口都到不了（可能是死代码），证明不了它在哪一侧；挪进真正的面再引';
    return (
      `${name}: ${rel} 里${what} —— 根入口是浏览器 barrel` +
      `（组件 + 它们自己的样式），两侧都不该从这里取运行值：浏览器侧会打进第二份实例、宿主侧会让 ` +
      `dist/host.js 在 Node 里 import 不进来（实测：一路拉到 dsh 的浏览器件）。${fix}。` +
      `只取类型就写 \`import type\`（编译期擦除、两侧都行）`
    );
  }
  if (side === 'host') return undefined;
  return (
    `${name}: ${rel} 里${what} —— 宿主入口里有 node:crypto / node:fs，` +
    `只有宿主侧能引（这个文件${SIDE_TEXT[side]}）；浏览器产物装不下它。` +
    `浏览器侧要的纯函数走 kit（@dsh-workbench/core/client）或自己写一个；只取类型就写 \`import type\``
  );
}

function sourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function resolveLocal(pkgDir, unit, fromFile, specifier) {
  let base;
  if (specifier.startsWith('@/')) {
    const own = `@/modules/${unit}/`;
    base = specifier.startsWith(own)
      ? join(pkgDir, 'src', specifier.slice(own.length))
      : join(pkgDir, 'src', specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    return undefined;
  }
  const stems = [base, base.replace(/\.js$/, '')];
  for (const stem of stems) {
    for (const candidate of [
      `${stem}.ts`,
      `${stem}.tsx`,
      join(stem, 'index.ts'),
      join(stem, 'index.tsx'),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function reachableFrom(pkgDir, unit, entry) {
  const seen = new Set();
  const start = join(pkgDir, entry);
  if (!existsSync(start)) return seen;
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2];
      if (specifier === undefined) continue;
      const next = resolveLocal(pkgDir, unit, file, specifier);
      if (next !== undefined && !seen.has(next)) queue.push(next);
    }
  }
  return seen;
}

function hasPlatformPackage(manifest) {
  const names = Object.keys({ ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) });
  return names.some((name) => /(^|\/)platform-/.test(name));
}

export const title = '模块源码边界与零注释';

export async function run() {
  const modulePackages = discoverModulePackages({ root: process.cwd() });
  const problems = [];
  let scanned = 0;
  let seedUsers = 0;

  for (const pkg of modulePackages) {
    const name = pkg.manifest.name;
    const unit = pkg.manifest.dsh.workbench.unit;
    const workbenchFaces = pkg.manifest.dsh.workbenchFaces ?? {};
    const srcDir = join(pkg.dir, 'src');
    const viaPlatform = hasPlatformPackage(pkg.manifest);

    for (const file of codeFiles(srcDir)) {
      const rel = relative(pkg.dir, file);
      const text = readFileSync(file, 'utf8');
      for (const line of commentViolationsOf(text, { css: file.endsWith('.css') })) {
        problems.push(
          `${name}: ${rel}:${line} 有注释 —— 模块源码零注释（说明写 README.md 或 spec；eslint / ts / vitest 指令注释除外）`,
        );
      }
    }

    if (viaPlatform && existsSync(join(srcDir, 'platforms'))) {
      problems.push(
        `${name}: 已经改用平台包了，src/platforms/ 就别再留一份 —— 平台知识两处都有，改平台要改两处`,
      );
    }

    const hostReach =
      workbenchFaces.host === undefined ? new Set() : reachableFrom(pkg.dir, unit, workbenchFaces.host);
    const clientReach =
      workbenchFaces.client === undefined ? new Set() : reachableFrom(pkg.dir, unit, workbenchFaces.client);
    const sideOf = (file) => {
      const host = hostReach.has(file);
      const client = clientReach.has(file);
      if (host && client) return 'both';
      if (host) return 'host';
      if (client) return 'client';
      return 'orphan';
    };

    for (const file of sourceFiles(srcDir)) {
      scanned += 1;
      const rel = relative(pkg.dir, file);
      const text = readFileSync(file, 'utf8');

      for (const match of text.matchAll(IMPORT)) {
        const specifier = match[1] ?? match[2];
        if (specifier === undefined) continue;

        if (specifier.startsWith('@deepseek-ai/')) {
          if (isSeedSpecifier(specifier) && sideOf(file) === 'client') {
            seedUsers += 1;
            continue;
          }
          if (isSeedSpecifier(specifier)) {
            const side = sideOf(file);
            const why =
              side === 'both'
                ? '这个文件**两个入口都到得了** —— 它会被拖进宿主产物'
                : side === 'orphan'
                  ? '这个文件两个入口都到不了（可能是死代码），证明不了它只在客户端侧'
                  : '这个文件在宿主侧可达';
            problems.push(
              `${name}: ${rel} 里 import 了 ${specifier}（dsh 的浏览器包，是平台种子词）—— ${why}，` +
                `而它只在浏览器侧存在。把它挪到只被 dsh.workbenchFaces.client 可达的文件里`,
            );
            continue;
          }
          problems.push(
            `${name}: ${rel} 里 import 了 ${specifier} —— 它不是平台种子词，模块表里没有它，` +
              `浏览器侧要用 dsh 的组件只能 import 种子词那几个；其余平台契约按需自己声明`,
          );
          continue;
        }
        if (specifier === '@/app' || specifier.startsWith('@/app/')) {
          problems.push(
            `${name}: ${rel} 里 import 了 ${specifier} —— 模块不许伸进外壳的入口/外壳层，只能走 kit 与 mount(deps)`,
          );
          continue;
        }
        const cross = /^@\/modules\/([^/]+)\//.exec(specifier);
        if (cross !== null && cross[1] !== unit) {
          problems.push(
            `${name}: ${rel} 里 import 了 ${specifier} —— 模块之间不许互相 import（另一个套件没装就没有这份源码）`,
          );
          continue;
        }
        const platform = /^@\/platforms\/([^/]+)\/(.+)$/.exec(specifier);
        if (platform !== null && viaPlatform) {
          problems.push(
            `${name}: ${rel} 里 import 了 ${specifier} —— 这个模块已经改用平台包了，平台知识走包名` +
              `（比如 @acme-dsh-workbench/platform），不许再用 @/platforms/*`,
          );
        } else if (platform !== null && !existsSync(join(srcDir, 'platforms', `${platform[2]}.ts`))) {
          problems.push(
            `${name}: ${rel} 里 import 了 ${specifier}，但本包 src/platforms/${platform[2]}.ts 不存在 —— ` +
              `平台知识要么放在自己包里的 src/platforms/，要么整个走平台包，两条只能选一条`,
          );
        }
      }

      for (const match of text.matchAll(SHARED_FROM)) {
        if (typeOnlyOf(match[2], match[3])) continue;
        const problem = sharedProblem(name, rel, match[4], sideOf(file), false);
        if (problem !== undefined) problems.push(problem);
      }
      for (const match of text.matchAll(SHARED_DYNAMIC)) {
        const problem = sharedProblem(name, rel, match[1], sideOf(file), true);
        if (problem !== undefined) problems.push(problem);
      }

      for (const entry of LIB_CAPABILITIES) {
        if (importsPreferred(text, entry.preferred)) continue;
        if (!entry.pattern.test(text)) continue;
        const line = text.split('\n').findIndex((one) => entry.pattern.test(one)) + 1;
        problems.push(
          `${name}: ${rel}:${String(line < 1 ? 1 : line)} 手写了 ${entry.capability} —— ${entry.why}` +
            `（首选 ${entry.preferred}；import 它，或把这件事交给外壳）`,
        );
      }
    }
  }

  if (problems.length > 0) {
    return { status: 'fail', notes: [], problems };
  }
  if (modulePackages.length === 0) {
    return {
      status: 'skip',
      notes: ['没有模块包（没有声明 dsh.workbench 的包）—— 没有源码要查边界'],
      problems: [],
    };
  }
  return {
    status: 'pass',
    notes: [
      `${scanned} 个源文件 · 不伸进外壳 app/ · 不跨模块 · ` +
        `平台知识要么在自己包里、要么走平台包（不许两样都有）· ` +
        `dsh 的浏览器包只在客户端侧可用（${seedUsers} 处）· ` +
        `共享包根入口只取类型、/host 只在宿主侧取运行值 · 不手写进程/锁/原子写`,
    ],
    problems: [],
  };
}
