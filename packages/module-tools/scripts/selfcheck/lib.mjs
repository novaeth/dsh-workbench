import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PKG_ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/[/\\]+$/, '');
export const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/[/\\]+$/, '');
export const PACKAGES_DIR = join(REPO_ROOT, 'packages');

export const BIN = join(PKG_ROOT, 'bin', 'dsh-wb-module.mjs');
export const HELLO = join(PACKAGES_DIR, 'module-hello');

const textCache = new Map();

export function read(path) {
  const key = typeof path === 'string' ? path : fileURLToPath(path);
  if (!textCache.has(key)) textCache.set(key, readFileSync(key, 'utf8'));
  return textCache.get(key);
}

export const FACES = { host: 'src/host.ts', client: 'src/client.tsx' };

export function scaffoldModule(
  dir,
  { host = 'export const manifest = {};\n', client = 'export const card = null;\n', patch = '- id: workbench\n' } = {},
) {
  mkdirSync(join(dir, 'dist'), { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'cordis.patch.yml'), patch);
  writeFileSync(join(dir, 'src/host.ts'), host);
  writeFileSync(join(dir, 'src/client.tsx'), client);
}

export function runCheck(probe, only, workspace) {
  try {
    const out = execFileSync(process.execPath, [BIN, 'check', '--only', only], {
      cwd: probe,
      env: workspace === undefined ? process.env : { ...process.env, DSH_WB_ROOT: workspace },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { failed: false, out: String(out) };
  } catch (error) {
    return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

export function runProbe(dir, problems, body) {
  try {
    body();
  } catch (error) {
    problems.push(String(error?.message ?? error).split('\n')[0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export async function withCleanup(title, report, dirs, body) {
  try {
    await body();
    report(title, true);
  } catch (error) {
    report(title, false, error.message.slice(0, 200));
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
}

export const declaration = (unit, extra = {}) => ({
  apiVersion: 3,
  unit,
  title: { zh: `${unit} 模块`, en: `${unit} module` },
  card: null,
  tools: [],
  host: { inject: [] },
  ...extra,
});

export function manifestOf(unit, workbench = declaration(unit)) {
  return `${JSON.stringify(
    {
      name: `@dsh-workbench/module-${unit}`,
      version: '0.0.1',
      private: true,
      type: 'module',
      peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
      scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
        workbench,
        workbenchFaces: FACES,
      },
    },
    null,
    2,
  )}\n`;
}

export function linkToolchain(toolchain, modules) {
  mkdirSync(modules, { recursive: true });
  const from = join(toolchain, 'node_modules');
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (!entry.name.startsWith('@')) {
      symlinkSync(join(from, entry.name), join(modules, entry.name), 'junction');
      continue;
    }
    mkdirSync(join(modules, entry.name), { recursive: true });
    for (const inner of readdirSync(join(from, entry.name))) {
      symlinkSync(join(from, entry.name, inner), join(modules, entry.name, inner), 'junction');
    }
  }
  mkdirSync(join(modules, '@dsh-workbench'), { recursive: true });
}

export function findToolchain() {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => join(PACKAGES_DIR, entry.name))
    .find(
      (dir) =>
        existsSync(join(dir, 'node_modules', '@dsh-workbench', 'core')) &&
        existsSync(join(dir, 'node_modules', '@dsh-workbench', 'module-tools')) &&
        existsSync(join(dir, 'node_modules', '.bin', 'vitest')),
    );
}

const PENDING = '（待填）';

export function fillPending(value) {
  if (typeof value === 'string') return value === PENDING ? '填好' : value;
  if (Array.isArray(value)) return value.map(fillPending);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillPending(item)]));
  }
  return value;
}

export function fillPendingDesign(dir) {
  const file = join(dir, 'design.json');
  writeFileSync(file, `${JSON.stringify(fillPending(JSON.parse(readFileSync(file, 'utf8'))), null, 2)}\n`);
  const sourceFile = join(dir, 'readme.json');
  if (existsSync(sourceFile)) {
    const source = JSON.parse(readFileSync(sourceFile, 'utf8'));
    for (const key of ['title', 'summary', 'see', 'do', 'agent', 'data', 'install', 'trouble']) {
      const value = source[key];
      if (typeof value === 'string' && value.includes('（待填')) source[key] = '填好';
      if (Array.isArray(value)) {
        source[key] = value.map((one) => {
          if (typeof one === 'string') return one.includes('（待填') ? '填好' : one;
          if (one !== null && typeof one === 'object' && typeof one.text === 'string' && one.text.includes('（待填')) {
            return { ...one, text: '填好' };
          }
          return one;
        });
      }
    }
    if (Array.isArray(source.shots)) {
      source.shots = source.shots.map((one) => ({ ...one, ascii: '┌─ 卡片 ─┐\n│ ● 标题 │\n└────────┘' }));
    }
    writeFileSync(sourceFile, `${JSON.stringify(source, null, 2)}\n`);
  }
}
