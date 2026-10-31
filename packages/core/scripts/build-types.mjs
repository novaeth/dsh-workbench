import { execaSync } from 'execa';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const STAGE = process.env.WB_STAGE_DIR;
const OUT = STAGE ? join(STAGE, 'dist/types') : join(ROOT, 'dist/types');

const FIXTURE_FILES = new Set(
  [
    'app/units/fixture-unit-mock.tsx',
    'app/layouts/rightbar/board-mock.ts',
    'app/layouts/rightbar/BoardMockStrip.tsx',
    'app/layouts/rightbar/market-mock.ts',
    'app/layouts/rightbar/market-installed-mock.ts',
    'app/layouts/rightbar/panel-mock.ts',
    'app/layouts/market/add-module-mock.ts',
    'app/layouts/env-gate/gate-mock.ts',
    'app/layouts/rightbar/kit-preview.tsx',
    'app/layouts/rightbar/kit-preview-rows.tsx',
    'app/layouts/rightbar/kit-preview-controls.tsx',
    'app/layouts/rightbar/kit-preview-frame.tsx',
    'shared/hooks/mock-mode.ts',
    'shared/hooks/use-fixture-pick.ts',
    'dev/surface.ts',
    'dev/MockStrip.tsx',
  ].map((path) => `${path.replace(/\.tsx?$/, '')}.d.ts`),
);

const isFixtureName = (name) => /mock/i.test(name) || name.startsWith('kit-preview');

const dropped = (rel) => {
  if (rel.startsWith('dev/')) return true;
  const parts = rel.split('/');
  if (parts.includes('__tests__')) return true;
  if (FIXTURE_FILES.has(rel)) return true;
  return isFixtureName(parts[parts.length - 1]);
};

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (entry.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

const rewriteAliases = (text, file, emitRoot) =>
  text.replace(/(from\s+|import\()'@\/([^']+)'/g, (_all, lead, spec) => {
    const target = join(emitRoot, spec);
    let rel = relative(dirname(file), target).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `${lead}'${rel}'`;
  });

const EMIT = mkdtempSync(join(tmpdir(), 'dsh-wb-types-'));
try {
  execaSync(
    'npx',
    ['tsc', '-p', 'tsconfig.json', '--noEmit', 'false', '--emitDeclarationOnly', '--declaration', '--outDir', EMIT],
    { cwd: ROOT, stdio: 'inherit' },
  );

  const emitted = walk(EMIT);
  rmSync(OUT, { recursive: true, force: true });

  let written = 0;
  let rewritten = 0;
  for (const file of emitted) {
    const rel = relative(EMIT, file).replace(/\\/g, '/');
    if (dropped(rel)) continue;
    const before = readFileSync(file, 'utf8');
    const after = rewriteAliases(before, file, EMIT);
    const dest = join(OUT, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, after, 'utf8');
    written += 1;
    if (after !== before) rewritten += 1;
  }

  const where = STAGE ? `${STAGE}/dist/types` : 'dist/types';
  console.log(
    `✔ 类型面：${written} 个 .d.ts → ${where}（emit ${emitted.length}，剔掉夹具与测试 ${emitted.length - written}；改写别名 ${rewritten} 个）`,
  );
} finally {
  rmSync(EMIT, { recursive: true, force: true });
}
