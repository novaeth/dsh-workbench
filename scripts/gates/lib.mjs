import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import coreArch from '../../packages/core/arch.config.mjs';
import sharedArch from '../../packages/shared/arch.config.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const WORKBENCH_SRC = join(ROOT, 'packages/core/src');
export const SHARED_SRC = join(ROOT, 'packages/shared/src');
export const SKILL_DIR = join(ROOT, 'packages/core/skills/workbench-module-diy');

const CACHE = new Map();

export function read(file) {
  const key = typeof file === 'string' ? file : fileURLToPath(file);
  if (!CACHE.has(key)) CACHE.set(key, readFileSync(key, 'utf8'));
  return CACHE.get(key);
}

export function relOf(file, base) {
  return relative(base, file).split('\\').join('/');
}

export function isTest(rel) {
  return /(?:^|\/)__tests__\//.test(rel) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel);
}

export function walkCode(base, { tests = false } = {}) {
  const out = [];
  const visit = (here) => {
    for (const entry of readdirSync(here)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
      if (!tests && entry === '__tests__') continue;
      const full = join(here, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        visit(full);
        continue;
      }
      if (!/\.(?:ts|tsx)$/.test(entry)) continue;
      if (!tests && /\.(?:test|spec)\./.test(entry)) continue;
      out.push(full);
    }
  };
  if (existsSync(base)) visit(base);
  return out;
}

const IMPORT =
  /(?:^|[;\s])(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function importsOf(text) {
  const out = [];
  for (const match of text.matchAll(IMPORT)) {
    const spec = match[1] ?? match[2];
    if (spec === undefined) continue;
    out.push({
      spec,
      line: text.slice(0, match.index).split('\n').length,
      typeOnly: /\b(?:import|export)\s+type\b/.test(match[0]),
    });
  }
  return out;
}

function existsWithExt(stem) {
  for (const candidate of [`${stem}.ts`, `${stem}.tsx`, join(stem, 'index.ts'), join(stem, 'index.tsx')]) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function resolveSpecifier(spec, fromFile, srcRoot) {
  const clean = spec.split('?')[0] ?? spec;
  let base;
  if (clean.startsWith('@/')) base = join(srcRoot, clean.slice(2));
  else if (clean.startsWith('.')) base = resolve(dirname(fromFile), clean);
  else return undefined;
  return existsWithExt(base.replace(/\.js$/, ''));
}

function layerTableOf(config) {
  const roles = config.presets?.[0]?.roles ?? [];
  if (roles.length === 0) throw new Error('arch.config.mjs 的 roles 表读不出来');
  const entries = [];
  const dirs = [];
  for (const role of roles) {
    const pattern = typeof role.pattern === 'string' ? role.pattern : '';
    const match = /^src\/([^*]+)$/.exec(pattern);
    if (match === null) continue;
    const rest = match[1];
    if (rest.endsWith('/**')) dirs.push({ prefix: `src/${rest.slice(0, -3)}/`, layer: role.layer });
    else if (!rest.includes('*')) entries.push({ file: `src/${rest}`, layer: role.layer });
  }
  dirs.sort((a, b) => b.prefix.length - a.prefix.length);
  return { entries, dirs };
}

const WORKBENCH_LAYERS = layerTableOf(coreArch);
const SHARED_LAYERS = layerTableOf(sharedArch);

function layerFrom(table, rel) {
  const path = rel.startsWith('src/') ? rel : `src/${rel}`;
  const entry = table.entries.find((one) => one.file === path);
  if (entry !== undefined) return entry.layer;
  const dir = table.dirs.find((one) => path.startsWith(one.prefix));
  return dir === undefined ? null : dir.layer;
}

export function layerOfWorkbench(rel) {
  if (isTest(rel)) return 99;
  return layerFrom(WORKBENCH_LAYERS, rel);
}

export function layerOfShared(rel) {
  if (isTest(rel)) return 99;
  return layerFrom(SHARED_LAYERS, rel);
}

export function reverseLayerFindings(files, srcRoot, layerOf) {
  const findings = [];
  for (const file of files) {
    const rel = relOf(file, srcRoot);
    const from = layerOf(rel);
    if (from === null || from === 99) continue;
    for (const imported of importsOf(read(file))) {
      const target = resolveSpecifier(imported.spec, file, srcRoot);
      if (target === undefined) continue;
      const targetRel = relOf(target, srcRoot);
      const to = layerOf(targetRel);
      if (to === null || to === 99) continue;
      if (to <= from) continue;
      findings.push({
        file: rel,
        line: imported.line,
        from,
        to,
        target: imported.spec,
        text: `第 ${from} 层 -> 第 ${to} 层（${imported.spec}）`,
        fix: `把目标挪到第 ${from} 层或更低；不要提高层号`,
      });
    }
  }
  return findings;
}

export function scanImports(files, relBase, match, message, fix) {
  const findings = [];
  for (const file of files) {
    const rel = relOf(file, relBase);
    for (const imported of importsOf(read(file))) {
      if (!match(imported.spec, rel)) continue;
      findings.push({ file: rel, line: imported.line, text: message(imported.spec), fix });
    }
  }
  return findings;
}

export function kernelSideFindings(files, srcRoot) {
  const findings = [];
  for (const file of files) {
    const rel = relOf(file, srcRoot);
    const side = /^kernel\/(host|client)\//.exec(rel)?.[1] ?? /^src\/kernel\/(host|client)\//.exec(rel)?.[1];
    if (side === undefined) continue;
    for (const imported of importsOf(read(file))) {
      const target = resolveSpecifier(imported.spec, file, srcRoot);
      if (target === undefined) continue;
      const targetRel = relOf(target, srcRoot);
      const other =
        /^kernel\/(host|client)\//.exec(targetRel)?.[1] ?? /^src\/kernel\/(host|client)\//.exec(targetRel)?.[1];
      if (other === undefined || other === side) continue;
      findings.push({
        file: rel,
        line: imported.line,
        text: `kernel ${side} -> ${other}（${imported.spec}）`,
        fix: '共享形状抬到 kernel/contract',
      });
    }
  }
  return findings;
}

export function vendorFieldsOf(text) {
  const match = /export interface UnitMountDeps \{([\s\S]*?)\n\}/.exec(text);
  if (match === null) return [];
  const body = match[1] ?? '';
  const bodyStart = match.index + match[0].indexOf('{') + 1;
  const known = new Set(['opencliCommand', 'probe']);
  const fields = [];
  for (const field of body.matchAll(/^\s*readonly\s+([A-Za-z0-9_]+)/gm)) {
    const name = field[1];
    if (!/^(opencli|browser|plugin|probe)/i.test(name) || known.has(name)) continue;
    fields.push({ name, line: text.slice(0, bodyStart + field.index).split('\n').length });
  }
  return fields;
}

export function hostExportSpecsOf(text) {
  return importsOf(text).filter((imported) => imported.spec.startsWith('./host/'));
}

export function contractImportLinesOf(text) {
  return text
    .split('\n')
    .map((line, index) => ({ line: index + 1, text: line }))
    .filter((one) => one.text.includes('@dsh-workbench/core/contract'))
    .filter((one) => !/import\s+type\b/.test(one.text));
}

export function missingModelTests(files, base = ROOT) {
  const out = [];
  for (const file of files) {
    const rel = relOf(file, base);
    if (!/(?:^|\/)src\/model\/[^/]+\.ts(?:\.tpl)?$/.test(rel)) continue;
    const sibling = file.replace(/\.ts(\.tpl)?$/, '.test.ts$1');
    const nested = join(dirname(file), '__tests__', basename(file).replace(/\.ts(\.tpl)?$/, '.test.ts$1'));
    if (!existsSync(sibling) && !existsSync(nested)) out.push(rel);
  }
  return out;
}

export function hasRolesBlock(text) {
  return text.includes('arch-guard:begin roles') && text.includes('arch-guard:end roles');
}

export function reachableFrom(entry, srcRoot, options = {}) {
  const seen = new Set();
  if (!existsSync(entry)) return seen;
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const imported of importsOf(read(file))) {
      if (options.valuesOnly === true && imported.typeOnly) continue;
      const target = resolveSpecifier(imported.spec, file, srcRoot);
      if (target !== undefined && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

export function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

export function protocolDeclarationsOf(text) {
  const pattern =
    /\b(?:interface|type)\s+(UnitModuleFace|UnitMountResult|UnitClientFace|UnitClientApi|UnitModuleRegistry|UnitClientRegistry|UnitRegistry|HostContext|ClientContext|BoardProps)\b/g;
  return [...text.matchAll(pattern)].map((match) => ({
    name: match[1],
    line: lineOf(text, match.index),
  }));
}

export function moduleSources() {
  const dirs = [
    join(ROOT, 'packages/module-hello/src'),
    join(ROOT, 'packages/module-tools/template-diy/src'),
  ];
  const out = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const walk = (here) => {
      for (const entry of readdirSync(here)) {
        if (entry === 'node_modules') continue;
        const full = join(here, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(?:ts|tsx|tpl)$/.test(entry)) continue;
        if (/\.test\./.test(entry)) continue;
        out.push(full);
      }
    };
    walk(dir);
  }
  return out;
}
