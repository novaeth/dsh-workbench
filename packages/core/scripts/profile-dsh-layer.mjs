import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SCOPE = '@deepseek-ai';
export const RUNTIME_PACKAGE = '@deepseek-ai/dsh';
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function manifestOf(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readDirNames(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

export function dshPackageNameOf(dirName) {
  return dirName === 'dsh' || dirName.startsWith('dsh-');
}

function layerOf(scopeDir) {
  const entries = [];
  for (const dirName of readDirNames(scopeDir).sort()) {
    if (!dshPackageNameOf(dirName)) continue;
    const manifest = manifestOf(join(scopeDir, dirName, 'package.json'));
    if (manifest === undefined || typeof manifest.version !== 'string') continue;
    entries.push({ name: `${SCOPE}/${dirName}`, version: manifest.version });
  }
  return entries;
}

export function readProfileLayer(profileDir) {
  return layerOf(join(profileDir, 'node_modules', SCOPE));
}

export function dshPackageDirOf(dshBin) {
  if (typeof dshBin !== 'string' || dshBin === '') return undefined;
  let resolved;
  try {
    resolved = realpathSync(dshBin);
  } catch {
    resolved = dshBin;
  }
  const probes = [];
  let here = dirname(resolved);
  for (;;) {
    probes.push(here);
    const parent = dirname(here);
    if (parent === here) break;
    here = parent;
  }
  probes.push(join(dirname(resolved), 'node_modules', SCOPE, 'dsh'));
  for (const dir of probes) {
    const manifest = manifestOf(join(dir, 'package.json'));
    if (manifest?.name === RUNTIME_PACKAGE) return dir;
  }
  return undefined;
}

export function readRuntimeLayer(dshPackageDir) {
  if (typeof dshPackageDir !== 'string' || dshPackageDir === '') return undefined;
  const roots = [join(dshPackageDir, 'node_modules', SCOPE), dirname(dshPackageDir)];
  const versions = new Map();
  for (const scopeDir of roots) {
    if (!existsSync(scopeDir)) continue;
    for (const entry of layerOf(scopeDir)) versions.set(entry.name, entry.version);
  }
  return versions.size > 0 ? versions : undefined;
}

export function verdictOf(input) {
  const runtimeVersion = String(input.runtimeVersion ?? '').trim();
  const layer = input.layer ?? [];
  const runtime = input.runtime;
  const mismatches = [];
  const unavailable = [];
  let foreign = 0;
  for (const entry of layer) {
    if (runtime === undefined) continue;
    const expected = runtime.get(entry.name);
    if (expected === undefined) {
      foreign += 1;
      continue;
    }
    if (entry.version === runtimeVersion && expected === runtimeVersion) continue;
    if (expected !== runtimeVersion) {
      unavailable.push({ ...entry, runtime: expected });
      continue;
    }
    mismatches.push(entry);
  }
  return {
    runtimeVersion,
    layerCount: layer.length,
    mismatchCount: mismatches.length,
    mismatches,
    unavailableCount: unavailable.length,
    unavailable,
    foreignCount: foreign,
  };
}

export function checkProfile(input) {
  const profileDir = String(input.profileDir ?? '');
  const manifestPath = join(profileDir, 'package.json');
  if (!existsSync(manifestPath)) throw new Error(`找不到 profile 清单：${manifestPath}`);
  const dshPackageDir = input.dshPackageDir ?? dshPackageDirOf(input.dshBin);
  const runtime = readRuntimeLayer(dshPackageDir);
  return {
    ...verdictOf({
      runtimeVersion: input.runtimeVersion,
      layer: readProfileLayer(profileDir),
      runtime,
    }),
    runtimeKnown: runtime !== undefined,
  };
}

function argsOf(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`认不出的参数：${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${token} 需要跟一个值`);
    out[key] = value;
    index += 1;
  }
  return out;
}

function sampleOf(entries, limit = 5) {
  return entries.slice(0, limit).map((entry) => `${entry.name}@${entry.version}`);
}

function summaryOf(verdict) {
  return {
    runtimeVersion: verdict.runtimeVersion,
    runtimeKnown: verdict.runtimeKnown,
    layerCount: verdict.layerCount,
    mismatchCount: verdict.mismatchCount,
    mismatchSample: sampleOf(verdict.mismatches),
    mismatchVersions: [...new Set(verdict.mismatches.map((entry) => entry.version))].sort(),
    unavailableCount: verdict.unavailableCount,
    unavailableSample: sampleOf(verdict.unavailable),
    foreignCount: verdict.foreignCount,
  };
}

function parseOptions(argv) {
  const args = argsOf(argv);
  const profileDir = args['profile-dir'];
  if (profileDir === undefined) throw new Error('缺 --profile-dir');
  const runtimeVersion = args.runtime;
  if (runtimeVersion === undefined || !SEMVER.test(runtimeVersion)) {
    throw new Error(`缺 --runtime 或格式不对：${String(runtimeVersion)}`);
  }
  const dshPackageDir = args['dsh-package'];
  const dshBin = args['dsh-bin'];
  return {
    profileDir,
    runtimeVersion,
    dshPackageDir,
    dshBin,
    check: () => checkProfile({ profileDir, runtimeVersion, dshPackageDir, dshBin }),
  };
}

function fail(error) {
  process.stderr.write(`profile-dsh-layer: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'check') {
    const options = parseOptions(rest);
    const verdict = options.check();
    process.stdout.write(`${JSON.stringify(summaryOf(verdict))}\n`);
    process.exit(verdict.mismatchCount === 0 ? 0 : 1);
  }
  throw new Error(`认不出的子命令：${String(command)}（只有 check）`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  fail(error);
}
