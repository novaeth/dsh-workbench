import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

const BARRELS = ['index.ts', 'host.ts'];

function isTestingEntry(rel) {
  return rel === 'testing.ts' || rel.startsWith('testing/');
}

function isInternal(rel) {
  return rel === 'lib/react.ts';
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

function relOf(file, base) {
  return relative(base, file).replace(/\\/g, '/');
}

function exportedNames(file) {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/^export (?:async )?(?:function|const|class|type|interface) ([A-Za-z0-9_]+)/gm)].map(
    (match) => match[1],
  );
}

function guardAgainstDuplicates(files, base) {
  const seen = new Map();
  for (const file of files) {
    const rel = relOf(file, base);
    for (const name of exportedNames(file)) {
      if (seen.has(name)) throw new Error(`重名导出 ${name}：${seen.get(name)} 与 ${rel} —— export * 会静默丢掉一个`);
      seen.set(name, rel);
    }
  }
  return seen.size;
}

function fileOfSpec(spec, base) {
  const stem = spec.replace(/^\.\//, '').replace(/\.js$/, '');
  for (const ext of ['.ts', '.tsx']) {
    if (existsSync(join(base, `${stem}${ext}`))) return join(base, `${stem}${ext}`);
  }
  throw new Error(`host.ts 里保留的再导出指向不存在的文件：${spec}`);
}

function emit(name, generated, base, keptSpecs = []) {
  const keptFiles = keptSpecs.map((spec) => fileOfSpec(spec, base));
  const count = guardAgainstDuplicates([...keptFiles, ...generated], base);
  const specs = [
    ...keptSpecs,
    ...generated.sort().map((file) => `./${relOf(file, base).replace(/\.tsx?$/, '.js')}`),
  ];
  writeFileSync(join(base, name), `${specs.map((spec) => `export * from '${spec}';`).join('\n')}\n`, 'utf8');
  console.log(`✔ ${name}：${specs.length} 个模块 / ${count} 个导出`);
}

function keptHostSpecs() {
  const path = join(SRC, 'host.ts');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => /^export \* from '(\.[^']+)';$/.exec(line.trim())?.[1])
    .filter((spec) => spec !== undefined && !spec.startsWith('./host/'));
}

const modules = walk(SRC).filter((file) => !BARRELS.includes(relOf(file, SRC)));

emit(
  'index.ts',
  modules.filter((file) => {
    const rel = relOf(file, SRC);
    return !rel.startsWith('host/') && !isTestingEntry(rel) && !isInternal(rel);
  }),
  SRC,
);

emit('host.ts', modules.filter((file) => relOf(file, SRC).startsWith('host/')), SRC, keptHostSpecs());
