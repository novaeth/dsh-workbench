import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHARED = join(HERE, '..');
const ROOT = join(SHARED, '..', '..');
const PACKAGES = join(ROOT, 'packages');
const OUTPUT = join(SHARED, 'src', 'host', 'release-packages.generated.ts');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (entry === 'package.json') found.push(full);
  }
  return found;
}

function scopeOf(name) {
  const cut = typeof name === 'string' ? name.indexOf('/') : -1;
  return cut > 0 && name.startsWith('@') ? name.slice(0, cut + 1) : '';
}

const root = readJson(join(ROOT, 'package.json'));
const scope = scopeOf(root.name);

const names = walk(PACKAGES)
  .map(readJson)
  .filter(
    (manifest) =>
      typeof manifest.name === 'string' &&
      manifest.name.startsWith(scope) &&
      manifest.private !== true &&
      manifest.publishConfig !== undefined &&
      manifest.dsh?.workbench === undefined,
  )
  .map((manifest) => manifest.name)
  .sort();

const content = `export const RELEASE_PACKAGES = [\n${names.map((name) => `  '${name}',`).join('\n')}\n] as const;\n`;

const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';

if (process.argv.includes('--check')) {
  if (current !== content) {
    console.error(`✖ ${relative(ROOT, OUTPUT)} 与工作区包清单不一致`);
    console.error('  跑 `node packages/shared/scripts/gen-release-packages.mjs` 重新生成，再看一眼 diff。');
    process.exit(1);
  }
  console.log(`✔ 发布包清单与工作区一致（${names.length} 个）`);
} else if (current === content) {
  console.log(`✔ 发布包清单无变化（${names.length} 个）`);
} else {
  writeFileSync(OUTPUT, content, 'utf8');
  console.log(`✔ 写入 ${relative(ROOT, OUTPUT)}：${names.join('、')}`);
}
