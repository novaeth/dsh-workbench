import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const PATTERNS = [
  /^export declare (?:const|function|class) (\w+)/gm,
  /^export (?:interface|type) (\w+)/gm,
  /^export \{([^}]*)\}/gm,
  /^declare (?:const|function|class) (\w+)/gm,
  /^(?:interface|type) (\w+)/gm,
];

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (full.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

function namesIn(clause) {
  if (!clause.includes(',') && !clause.includes(' ')) return [clause];
  return clause
    .split(',')
    .map((raw) => raw.trim().split(/\s+as\s+/).pop().trim())
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

export function shellTypeRoots(shellClientPath) {
  const shellRoot = dirname(shellClientPath);
  const roots = {};
  const shellTypes = join(shellRoot, 'dist', 'types');
  if (existsSync(shellTypes)) roots.shell = shellTypes;

  const viaNodeModules = join(shellRoot, 'node_modules', '@dsh-workbench', 'shared', 'dist');
  try {

    const sharedEntry = createRequire(join(shellRoot, 'package.json')).resolve('@dsh-workbench/shared');
    const sharedTypes = dirname(sharedEntry);
    if (existsSync(sharedTypes)) roots.shared = existsSync(viaNodeModules) ? viaNodeModules : sharedTypes;
  } catch {

  }
  return { shellRoot, roots };
}

function preferred(candidates) {
  const rank = (file) =>
    file.includes('/components/')
      ? 0
      : file.includes('/hooks/')
        ? 1
        : file.includes('/lib/')
          ? 2
          : /\/(app|modules)\//.test(file)
            ? 9
            : 3;
  return [...candidates].sort((a, b) => rank(a.file) - rank(b.file) || a.file.length - b.file.length)[0];
}

export function memberFilesOf(shellClientPath, names) {
  const { roots } = shellTypeRoots(shellClientPath);
  const index = new Map();
  for (const root of Object.values(roots)) {
    for (const file of walk(root)) {
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const pattern of PATTERNS) {
        for (const match of text.matchAll(pattern)) {
          for (const name of namesIn(match[1])) {
            if (!index.has(name)) index.set(name, []);
            const found = index.get(name);
            if (!found.some((one) => one.file === file)) found.push({ file });
          }
        }
      }
    }
  }
  const files = new Map();
  const missing = [];
  for (const name of names) {
    const candidates = index.get(name);
    if (candidates === undefined || candidates.length === 0) missing.push(name);
    else files.set(name, preferred(candidates).file);
  }
  return { roots, files, missing };
}
