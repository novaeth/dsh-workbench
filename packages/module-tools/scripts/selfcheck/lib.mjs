import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
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

export const declaration = (unit, extra = {}) => ({
  apiVersion: 1,
  unit,
  card: null,
  tools: [],
  host: { inject: [] },
  ...extra,
});

export function linkToolchain(toolchain, modules) {
  mkdirSync(modules, { recursive: true });
  const from = join(toolchain, 'node_modules');
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (!entry.name.startsWith('@')) {
      symlinkSync(join(from, entry.name), join(modules, entry.name));
      continue;
    }
    mkdirSync(join(modules, entry.name), { recursive: true });
    for (const inner of readdirSync(join(from, entry.name))) {
      symlinkSync(join(from, entry.name, inner), join(modules, entry.name, inner));
    }
  }
  mkdirSync(join(modules, '@dsh-workbench'), { recursive: true });
}

export function findToolchain() {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIR, entry.name))
    .find(
      (dir) =>
        existsSync(join(dir, 'node_modules', '@dsh-workbench', 'core')) &&
        existsSync(join(dir, 'node_modules', '@dsh-workbench', 'module-tools')) &&
        existsSync(join(dir, 'node_modules', '.bin', 'vitest')),
    );
}
