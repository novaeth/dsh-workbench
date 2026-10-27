import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

function copyCss(from, to) {
  let count = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) {
      count += copyCss(source, target);
      continue;
    }
    if (!entry.name.endsWith('.css')) continue;
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
    count += 1;
  }
  return count;
}

const count = copyCss(join(root, 'src'), join(root, 'dist'));
if (count === 0) {
  console.error('copy-css：src 下一份 CSS 都没有 —— 组件样式不见了？');
  process.exit(1);
}
console.log(`copy-css：搬了 ${count} 份 CSS 到 dist`);
