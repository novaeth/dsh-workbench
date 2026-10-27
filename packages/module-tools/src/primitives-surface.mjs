import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const PRIMITIVES_SPECIFIER = '@deepseek-ai/dsh-client-ui-primitives';

export function installedPrimitives(from) {
  try {
    const require = createRequire(join(from, 'package.json'));
    const manifest = require.resolve(`${PRIMITIVES_SPECIFIER}/package.json`);
    const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
    const version = typeof parsed.version === 'string' ? parsed.version : undefined;

    const viaNodeModules = join(from, 'node_modules', ...PRIMITIVES_SPECIFIER.split('/'));
    const dir = existsSync(join(viaNodeModules, 'package.json')) ? viaNodeModules : dirname(manifest);
    return { manifest, dir, version };
  } catch {
    return undefined;
  }
}

export function pinnedPrimitivesVersion(manifestPath) {
  try {
    const pinned = JSON.parse(readFileSync(manifestPath, 'utf8')).devDependencies?.[PRIMITIVES_SPECIFIER];
    return typeof pinned === 'string' && pinned !== '' ? pinned : undefined;
  } catch {
    return undefined;
  }
}

const STATEMENT = /export\s+(type\s+)?(\*|\{[^}]*\})\s*from\s*'([^']+)'/g;
const DECLARED = /^export declare (?:const|function|class)\s+([A-Za-z_$][\w$]*)/gm;
const MAX_STAR_DEPTH = 3;

function dtsTargetOf(fromFile, specifier) {
  const base = join(dirname(fromFile), specifier);
  const stripped = base.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
  const candidates = [`${stripped}.d.ts`, join(stripped, 'index.d.ts'), `${base}.d.ts`];
  return candidates.find((one) => existsSync(one));
}

function namesOf(statement) {
  return statement
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .split(',')
    .map((raw) => raw.trim().split(/\s+as\s+/).pop().trim())
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

function collect(file, origin, acc, depth) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const match of text.matchAll(DECLARED)) acc.set(match[1], { origin, file });
  for (const match of text.matchAll(STATEMENT)) {
    if (match[1] !== undefined) continue;
    if (match[2] === '*') {
      if (depth >= MAX_STAR_DEPTH) continue;
      const target = dtsTargetOf(file, match[3]);
      if (target !== undefined) collect(target, origin, acc, depth + 1);
      continue;
    }

    const declaredIn = dtsTargetOf(file, match[3]) ?? file;
    for (const name of namesOf(match[2])) acc.set(name, { origin, file: declaredIn });
  }
}

export function surfaceOf(typesDir) {
  const entry = join(typesDir, 'index.d.ts');
  if (!existsSync(entry)) throw new Error(`类型面不在：${entry}`);
  const found = new Map();
  collect(entry, 'root', found, 0);
  const iconsEntry = join(typesDir, 'icons', 'index.d.ts');
  if (existsSync(iconsEntry)) collect(iconsEntry, 'icons', found, 0);

  const buckets = { components: [], icons: [], hooks: [], lib: [] };
  const files = {};
  for (const [name, { origin, file }] of found) {
    files[name] = file;
    if (origin === 'icons' && !name.startsWith('Icon')) buckets.lib.push(name);
    else if (name.startsWith('Icon')) buckets.icons.push(name);
    else if (/^use[A-Z]/.test(name)) buckets.hooks.push(name);
    else if (/^[A-Z][A-Z0-9_]*$/.test(name)) buckets.lib.push(name);
    else if (/^[A-Z]/.test(name)) buckets.components.push(name);
    else buckets.lib.push(name);
  }
  for (const key of Object.keys(buckets)) buckets[key].sort();
  return { ...buckets, total: found.size, files };
}
