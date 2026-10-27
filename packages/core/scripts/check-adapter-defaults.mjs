import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const packages = join(root, '..');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const core = read(join(root, 'package.json'));
const meta = read(join(packages, 'adapters-default', 'package.json'));
const names = ['adapter-runtime', 'adapter-supply', 'adapter-profile', 'adapter-probe'];
const problems = [];
const walk = (dir) => existsSync(dir) ? readdirSync(dir).flatMap((entry) => { const full = join(dir, entry); return statSync(full).isDirectory() ? walk(full) : [full]; }) : [];

if (core.dependencies?.['@dsh-workbench/adapters-default'] === undefined) problems.push('core 未依赖 adapters-default');
if (core.optionalDependencies?.['@dsh-workbench/adapters-default'] !== undefined) problems.push('core 把 adapters-default 放进了 optional');
if (core.peerDependencies?.['@dsh-workbench/adapters-default'] !== undefined) problems.push('core 把 adapters-default 放进了 peer');
for (const name of names) {
  const pkgName = `@dsh-workbench/${name}`;
  const pkg = read(join(packages, name, 'package.json'));
  if (meta.dependencies?.[pkgName] === undefined) problems.push(`adapters-default 未依赖 ${pkgName}`);
  if (meta.optionalDependencies?.[pkgName] !== undefined) problems.push(`adapters-default 把 ${pkgName} 放进了 optional`);
  if (meta.peerDependencies?.[pkgName] !== undefined) problems.push(`adapters-default 把 ${pkgName} 放进了 peer`);
  if (pkg.peerDependencies?.['@dsh-workbench/core'] !== undefined) problems.push(`${pkgName} 不应声明 core peer（core 依赖它，会成环）`);
  const entry = pkg.exports?.['.']?.default;
  if (typeof entry !== 'string' || !existsSync(join(packages, name, entry))) problems.push(`${pkgName} 的出货入口不存在：${String(entry)}`);
  for (const file of walk(join(packages, name, 'dist'))) {
    const rel = file.slice(join(packages, name, 'dist').length);
    if (/\.test\.|__tests__|fixture|mock|testing|fake/i.test(rel)) problems.push(`${pkgName} 的 dist 里混入测试/夹具：${rel}`);
  }
}
const concrete = `@dsh-workbench/(?:adapters-default|adapter-[a-z0-9-]+)(?:/[^'"]*)?`;
const STATIC = new RegExp(`(?:from|import)\\s*['"]${concrete}['"]`);
const DYNAMIC = new RegExp(`import\\s*\\([^'")]*['"]${concrete}['"]`);
const REQUIRE = new RegExp(`require\\s*\\([^'")]*['"]${concrete}['"]`);
const DYNAMIC_CONCRETE = new RegExp(`import\\s*\\([^'")]*['"]@dsh-workbench/adapter-[a-z0-9-]+(?:/[^'"]*)?['"]`);
const stripBlocks = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ');
const areas = [
  { dir: join(root, 'src'), label: 'core', composed: true },
  { dir: join(packages, 'shared', 'src'), label: 'shared' },
  { dir: join(packages, 'module-tools', 'src'), label: 'module-tools' },
];
for (const area of areas) {
  for (const file of walk(area.dir)) {
    const rel = file.slice(area.dir.length + 1);
    if (/\.test\.|__tests__/.test(rel)) continue;
    if (!/\.(ts|tsx|mjs|js)$/.test(rel)) continue;
    const text = stripBlocks(readFileSync(file, 'utf8'));
    const where = `${area.label}/${rel}`;
    if (area.composed === true && rel === 'app/host.ts') {
      if (STATIC.test(text) || REQUIRE.test(text)) {
        problems.push('app/host.ts 不许静态 import / require 具体适配器（只许 dynamic import 默认集合兜底）');
      }
      if (DYNAMIC_CONCRETE.test(text)) {
        problems.push('app/host.ts 的 dynamic import 只许 adapters-default，不许具体 adapter 包');
      }
      continue;
    }
    if (STATIC.test(text) || DYNAMIC.test(text) || REQUIRE.test(text)) {
      problems.push(`${where} 碰了具体适配器；只有 core 的 app/host.ts 可以 dynamic import 默认集合兜底`);
    }
  }
}

const metaNames = Object.keys(meta.dependencies ?? {}).filter((one) => one.startsWith('@dsh-workbench/adapter-')).sort();
const expectedNames = names.map((one) => `@dsh-workbench/${one}`).sort();
if (JSON.stringify(metaNames) !== JSON.stringify(expectedNames)) problems.push(`adapters-default 依赖不是四个实现包：${metaNames.join(', ')}`);

if (problems.length > 0) {
  console.error(`✖ 默认适配器包图不对：\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`✔ 默认适配器包图：core → adapters-default → ${names.join(' / ')}（全是 dependencies）`);
