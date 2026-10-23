import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { discoverModulePackages } from '../discover.mjs';

const SPECIFIER = /(?:from|import)\s*\(?\s*['"](@\/[^'"]+)['"]/g;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

export const title = '模块不指外壳';

export async function run() {
  const modules = discoverModulePackages({ root: process.cwd() });
  const problems = [];
  for (const pkg of modules) {
    const unit = pkg.manifest.dsh?.workbench?.unit;
    const src = join(pkg.dir, 'src');
    const viaPlatform = /(^|\/)platform-/.test(
      Object.keys({ ...(pkg.manifest.dependencies ?? {}), ...(pkg.manifest.devDependencies ?? {}) }).join(' '),
    );
    if (unit === undefined) continue;
    for (const file of walk(src)) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, index) => {
        for (const match of line.matchAll(SPECIFIER)) {
          const specifier = match[1];
          const own = specifier.startsWith(`@/modules/${unit}/`);
          const selfPlatform = specifier.startsWith('@/platforms/') && !viaPlatform;
          if (!own && !selfPlatform) {
            problems.push(
              `${pkg.manifest.name}: ${relative(pkg.dir, file)}:${index + 1} 用了 ${specifier} —— ` +
                `模块只许引自己的 @/modules/${unit}/*；共享代码走包名，平台知识走包名或本包的 @/platforms/*（用了平台包就不许再用）`,
            );
          }
        }
      });
    }
  }

  if (problems.length > 0) {
    return { status: 'fail', notes: [], problems };
  }
  if (modules.length === 0) {
    return {
      status: 'skip',
      notes: ['没有模块包（没有声明 dsh.workbench 的包）—— 没有源码要查 @/'],
      problems: [],
    };
  }
  return {
    status: 'pass',
    notes: [`${modules.length} 个模块的 src 里没有指向外壳的 @/`],
    problems: [],
  };
}
