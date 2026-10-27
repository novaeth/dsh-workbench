import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = process.cwd();
const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
const problems = [];

function walk(path) {
  if (!existsSync(path)) return [];
  const out = [];
  for (const entry of readdirSync(path)) {
    const full = join(path, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

if (existsSync(join(dir, 'src', 'contract'))) problems.push('src/contract 仍在本包；协议必须住 shared/src/contract/protocol');
if (!pkg.scripts?.build) problems.push('缺少 build 脚本');
if (!pkg.scripts?.test) problems.push('缺少 test 脚本');
if (!pkg.files?.includes('dist')) problems.push('files 未包含 dist');
if (!existsSync(join(dir, 'dist'))) problems.push('dist 不存在，先跑 build');

const allowed = /^(node:|@dsh-workbench\/(shared|adapter-[a-z-]+)|execa$|proper-lockfile$|write-file-atomic$|dayjs$)/;
for (const file of walk(join(dir, 'src'))) {
  if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
  const rel = relative(dir, file).split('\\').join('/');
  if (/\.(js|jsx|mjs|cjs)$/.test(rel)) problems.push(`${rel}: 源码必须是 TypeScript`);
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = match[1];
    if (spec.startsWith('.')) continue;
    if (!allowed.test(spec)) problems.push(`${rel}: 越界 import ${spec}`);
  }
}

if (problems.length > 0) {
  console.error(`✖ ${pkg.name} 不适配器包边界：\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`✔ ${pkg.name} 适配器包边界`);
