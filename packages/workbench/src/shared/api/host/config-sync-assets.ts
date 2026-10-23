import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ConfigSyncAsset,
  ConfigSyncAssetFile,
  ConfigSyncAssetState,
} from '../config-sync.js';

export interface CopyPlan {
  readonly source: string;
  readonly target: string;
  readonly path: string;
  readonly overwrite: boolean;
}

interface InsideAsset {
  readonly kind: 'inside';
  readonly rel: string;
  readonly abs: string;
}

interface OutsideAsset {
  readonly kind: 'outside';
  readonly path: string;
}

type AssetLocation = InsideAsset | OutsideAsset;

const NAME_LINE = /^[ \t]*-?[ \t]*name:[ \t]*['"]?([^'"\s#]+)/;
const INSERT_LINE = /^- insert:[ \t]*$/;
const ASSET_MAX_BYTES = 8 * 1024 * 1024;
const ASSET_MAX_TOTAL = 32 * 1024 * 1024;
const ASSET_MAX_FILES = 500;
const ASSET_SKIP = new Set(['node_modules', '.git', '.DS_Store']);

function matched(text: string, pattern: RegExp): string | undefined {
  const found = pattern.exec(text);
  return found === null ? undefined : found[1];
}

export interface AssetBlock {
  readonly insert: boolean;
  readonly body: string;
}

function looksLikeAssetName(value: string): boolean {
  return value.startsWith('./') || value.startsWith('../') || value.startsWith('file://') || isAbsolute(value);
}

function insertNamesOf(body: string): readonly string[] {
  if (!INSERT_LINE.test(body.split('\n')[0] ?? '')) return [];
  return body
    .split('\n')
    .flatMap((line) => {
      const name = matched(line, NAME_LINE);
      return name !== undefined && looksLikeAssetName(name) ? [name] : [];
    });
}

function assetLocationOf(name: string, profileDir: string): AssetLocation | null {
  let abs: string | null = null;
  if (name.startsWith('file://')) {
    try {
      abs = fileURLToPath(name);
    } catch {
      return null;
    }
  } else if (name.startsWith('./') || name.startsWith('../')) {
    abs = resolve(profileDir, name);
  } else if (isAbsolute(name)) {
    abs = resolve(name);
  }
  if (abs === null) return null;
  const rel = relative(profileDir, abs);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return { kind: 'outside', path: name };
  }
  return { kind: 'inside', rel: rel.split(sep).join('/'), abs };
}

function hashOf(path: string): string {
  return createHash('sha1').update(readFileSync(path)).digest('hex');
}

function fileStateOf(source: string, target: string): ConfigSyncAssetState {
  try {
    const sourceStat = statSync(source);
    if (sourceStat.size > ASSET_MAX_BYTES) return 'external';
    let targetStat;
    try {
      targetStat = statSync(target);
    } catch {
      return 'missing';
    }
    if (!targetStat.isFile() || targetStat.size !== sourceStat.size) return 'differs';
    return hashOf(source) === hashOf(target) ? 'same' : 'differs';
  } catch {
    return 'external';
  }
}

function collectDirFiles(
  dir: string,
  profileDir: string,
  found: string[],
  budget: { bytes: number },
): boolean {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (ASSET_SKIP.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    const rel = relative(profileDir, abs).split(sep).join('/');
    if (entry.isSymbolicLink()) return false;
    if (entry.isDirectory()) {
      if (!collectDirFiles(abs, profileDir, found, budget)) return false;
      continue;
    }
    if (!entry.isFile()) continue;
    let size;
    try {
      size = statSync(abs).size;
    } catch {
      return false;
    }
    if (size > ASSET_MAX_BYTES) return false;
    budget.bytes += size;
    if (budget.bytes > ASSET_MAX_TOTAL || found.length >= ASSET_MAX_FILES) return false;
    found.push(rel);
  }
  return true;
}

function aggregateAssetState(files: readonly ConfigSyncAssetFile[]): ConfigSyncAssetState {
  if (files.some((file) => file.state === 'external')) return 'external';
  if (files.some((file) => file.state === 'differs')) return 'differs';
  if (files.some((file) => file.state === 'missing')) return 'missing';
  return 'same';
}

function externalAsset(path: string, reason: string): ConfigSyncAsset {
  return {
    key: `asset:${path}`,
    path,
    kind: 'file',
    state: 'external',
    files: [],
    bytes: 0,
    reason,
  };
}

function assetOf(name: string, sourceDir: string, targetDir: string): ConfigSyncAsset | null {
  const location = assetLocationOf(name, sourceDir);
  if (location === null) return null;
  if (location.kind === 'outside') return externalAsset(location.path, '这个文件在 profile 外面');
  let sourceStat;
  try {
    sourceStat = lstatSync(location.abs);
  } catch {
    return externalAsset(location.rel, '来源里没有这个文件');
  }
  if (sourceStat.isSymbolicLink()) return externalAsset(location.rel, '符号链接不会跟着搬');
  if (sourceStat.isDirectory()) {
    const found: string[] = [];
    if (!collectDirFiles(location.abs, sourceDir, found, { bytes: 0 })) {
      return externalAsset(location.rel, '目录太大或含符号链接，先手动复制');
    }
    const files = found.map((path) => {
      const source = join(sourceDir, path);
      const bytes = statSync(source).size;
      return { path, state: fileStateOf(source, join(targetDir, path)), bytes };
    });
    return {
      key: `asset:${location.rel}`,
      path: location.rel,
      kind: 'dir',
      state: aggregateAssetState(files),
      files,
      bytes: files.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
    };
  }
  if (!sourceStat.isFile()) return externalAsset(location.rel, '不是普通文件');
  const state = fileStateOf(location.abs, join(targetDir, location.rel));
  return {
    key: `asset:${location.rel}`,
    path: location.rel,
    kind: 'file',
    state,
    files: [{ path: location.rel, state, bytes: sourceStat.size }],
    bytes: sourceStat.size,
  };
}

export function assetsOf(
  block: AssetBlock,
  sourceDir: string,
  targetDir: string,
): readonly ConfigSyncAsset[] {
  if (!block.insert) return [];
  const seen = new Set<string>();
  const assets: ConfigSyncAsset[] = [];
  for (const name of insertNamesOf(block.body)) {
    const asset = assetOf(name, sourceDir, targetDir);
    if (asset === null || seen.has(asset.key)) continue;
    seen.add(asset.key);
    assets.push(asset);
  }
  return assets;
}

export function assetMapOf(
  blocks: readonly AssetBlock[],
  sourceDir: string,
  targetDir: string,
): Map<string, ConfigSyncAsset> {
  const map = new Map<string, ConfigSyncAsset>();
  for (const block of blocks) {
    for (const asset of assetsOf(block, sourceDir, targetDir)) map.set(asset.key, asset);
  }
  return map;
}

function insideTarget(targetDir: string, path: string): boolean {
  const target = resolve(targetDir, path);
  const rel = relative(targetDir, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

export function planCopies(
  assets: readonly ConfigSyncAsset[],
  sourceDir: string,
  targetDir: string,
  overwriteAssets: ReadonlySet<string>,
): { ok: true; plans: readonly CopyPlan[] } | { ok: false; text: string } {
  const plans: CopyPlan[] = [];
  let total = 0;
  for (const asset of assets) {
    if (asset.state === 'external') {
      return { ok: false, text: `这个文件搬不过来：${asset.path}${asset.reason === undefined ? '' : `（${asset.reason}）`}` };
    }
    for (const file of asset.files) {
      if (file.state === 'same') continue;
      if (file.state === 'external') {
        return { ok: false, text: `这个文件搬不过来：${file.path}${asset.reason === undefined ? '' : `（${asset.reason}）`}` };
      }
      const overwrite = file.state === 'differs';
      if (overwrite && !overwriteAssets.has(asset.key)) {
        return { ok: false, text: `文件不一样：${file.path}。勾上覆盖再试` };
      }
      if (!insideTarget(targetDir, file.path)) {
        return { ok: false, text: `这个文件会写到 profile 外面：${file.path}` };
      }
      total += file.bytes ?? 0;
      if (total > ASSET_MAX_TOTAL) {
        return { ok: false, text: `这次要复制的文件太大（超过 ${String(ASSET_MAX_TOTAL / 1024 / 1024)} MB），先手动复制` };
      }
      plans.push({
        source: join(sourceDir, file.path),
        target: join(targetDir, file.path),
        path: file.path,
        overwrite,
      });
    }
  }
  return { ok: true, plans };
}

export function cleanupFiles(created: readonly string[], backups: ReadonlyMap<string, Buffer>): void {
  for (const file of [...created].reverse()) {
    try {
      unlinkSync(file);
    } catch {
      continue;
    }
  }
  for (const [file, body] of backups) {
    try {
      writeFileSync(file, body);
    } catch {
      continue;
    }
  }
}

export function copyPlans(plans: readonly CopyPlan[]):
  | { ok: true; files: string[]; created: string[]; backups: Map<string, Buffer> }
  | { ok: false; text: string; created: string[]; backups: Map<string, Buffer> } {
  const created: string[] = [];
  const backups = new Map<string, Buffer>();
  const files: string[] = [];
  for (const plan of plans) {
    try {
      mkdirSync(dirname(plan.target), { recursive: true });
      if (existsSync(plan.target)) {
        if (!plan.overwrite) continue;
        backups.set(plan.target, readFileSync(plan.target));
      } else {
        created.push(plan.target);
      }
      const mode = statSync(plan.source).mode & 0o777;
      const tmp = `${plan.target}.wb-sync-${String(process.pid)}-${String(files.length)}`;
      copyFileSync(plan.source, tmp);
      chmodSync(tmp, mode);
      renameSync(tmp, plan.target);
      files.push(plan.path);
    } catch (error) {
      return {
        ok: false,
        text: `写不进去：${error instanceof Error ? error.message : String(error)}`,
        created,
        backups,
      };
    }
  }
  return { ok: true, files, created, backups };
}
