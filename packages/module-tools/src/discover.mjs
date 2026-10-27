import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

function manifestOf(dir) {
  const file = join(dir, 'package.json');
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

export function workspaceRootOf(start) {
  if (process.env.DSH_WB_ROOT) return process.env.DSH_WB_ROOT;
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'packages')) || existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function discoverPackages({ root = process.cwd() } = {}) {
  const workspace = workspaceRootOf(root);
  const dirs = [];
  const packagesDir = join(workspace, 'packages');
  if (existsSync(packagesDir)) {
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {

      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      dirs.push(join(packagesDir, entry.name));
    }
  }
  dirs.push(root, workspace);
  const seen = new Set();
  const found = [];
  for (const dir of dirs) {

    const key = existsSync(dir) ? realpathSync(dir) : dir;
    if (seen.has(key)) continue;
    seen.add(key);
    const manifest = manifestOf(dir);
    if (manifest === undefined || typeof manifest.name !== 'string') continue;
    found.push({ dir, manifest });
  }
  return found;
}

export function discoverModulePackages(options = {}) {
  return discoverPackages(options).filter((pkg) => pkg.manifest.dsh?.workbench !== undefined);
}
