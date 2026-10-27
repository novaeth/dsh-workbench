import { existsSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PostResource, RouteHandler } from '@dsh-workbench/shared/host';
import type { ConfigSyncProfile, ConfigSyncRow, ConfigSyncSnapshot } from '@dsh-workbench/shared/contract/protocol/config-sync';
import { CONFIG_SYNC_RESOURCE } from '@dsh-workbench/shared/contract/protocol/config-sync';

export interface PatchBlock {
  readonly key: string;
  readonly id: string;
  readonly insert: boolean;
  readonly body: string;
  readonly names: readonly string[];
}

interface SpannedBlock extends PatchBlock {
  readonly from: number;
  readonly to: number;
}

const ID_LINE = /^- id:[ \t]*"?([^"\s#]+)/;
const INSERT_LINE = /^- insert:[ \t]*$/;
const NESTED_ID = /^[ \t]+-[ \t]*id:[ \t]*"?([^"\s#]+)/;
const NAME_LINE = /^[ \t]*-?[ \t]*name:[ \t]*['"]?([^'"\s#]+)/;
const COMMENT_LINE = /^[ \t]*#/;
const ISOLATION_IDS = new Set([
  'session-persistence-jsonl',
  'storage-json',
  'attachment-local',
  'sandbox-policy',
]);

function trimmedTail(lines: readonly string[]): readonly string[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? '').trim() === '') end -= 1;
  return lines.slice(0, end);
}

function matched(text: string, pattern: RegExp): string | undefined {
  const found = pattern.exec(text);
  return found === null ? undefined : found[1];
}

function blockOf(body: string, index: number): PatchBlock {
  const lines = body.split('\n');
  const first = lines[0] ?? '';
  const id = matched(first, ID_LINE);
  const nested = lines.flatMap((line) => {
    const one = matched(line, NESTED_ID);
    return one === undefined ? [] : [one];
  });
  const insert = id === undefined && INSERT_LINE.test(first);
  const label = id ?? nested.join(', ');
  const key = id !== undefined ? `id:${id}` : insert ? `insert:${nested.join(', ')}` : `block:${String(index)}`;
  const names = lines.flatMap((line) => {
    const one = matched(line, NAME_LINE);
    return one === undefined ? [] : [one];
  });
  return { key, id: label === '' ? key : label, insert, body, names };
}

function spannedBlocks(text: string): SpannedBlock[] {
  const lines = text.split('\n');
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (/^- /.test(line) || line === '-') starts.push(index);
  });
  const blocks: SpannedBlock[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i] ?? 0;
    const to = i + 1 < starts.length ? (starts[i + 1] ?? lines.length) : lines.length;
    const body = trimmedTail(lines.slice(from, to)).join('\n');
    if (body.trim() === '') continue;
    blocks.push({ ...blockOf(body, blocks.length), from, to });
  }
  return blocks;
}

export function patchBlocks(text: string): PatchBlock[] {
  return spannedBlocks(text).map(({ from: _from, to: _to, ...block }) => block);
}

export function normalizeBlock(body: string): string {
  return body
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim() !== '' && !COMMENT_LINE.test(line))
    .join('\n');
}

function rewriteForTarget(body: string, self: string): string {
  if (self === '' || self === 'workbench') return body;
  return body.replace(/(dshHomePath\(\s*['"])workbench(?=[/'"])/g, `$1${self}`);
}

function syncable(block: PatchBlock): boolean {
  return !block.insert && !ISOLATION_IDS.has(block.id);
}

export function syncRows(
  source: readonly PatchBlock[],
  own: readonly PatchBlock[],
  missing: (block: PatchBlock) => readonly string[],
): ConfigSyncRow[] {
  const mine = new Map(own.map((block) => [block.key, block]));
  const rows: ConfigSyncRow[] = [];
  for (const block of source) {
    if (!syncable(block)) continue;
    const here = mine.get(block.key);
    if (here !== undefined && normalizeBlock(here.body) === normalizeBlock(block.body)) continue;
    rows.push({
      key: block.key,
      id: block.id,
      state: here === undefined ? 'new' : 'differs',
      body: block.body,
      ownBody: here === undefined ? null : here.body,
      missing: missing(block),
    });
  }
  return rows;
}

function replaceBlocks(text: string, blocks: readonly PatchBlock[]): string {
  const wanted = new Map(blocks.map((block) => [block.key, block]));
  const spans = spannedBlocks(text).filter((span) => wanted.has(span.key));
  const lines = text.split('\n');
  for (const span of [...spans].reverse()) {
    const replacement = (wanted.get(span.key)?.body ?? '').split('\n');
    lines.splice(span.from, span.to - span.from, ...replacement);
  }
  return lines.join('\n');
}

function appendBlocks(text: string, blocks: readonly PatchBlock[]): string {
  const kept = text
    .split('\n')
    .filter((line) => line.trim() !== '[]')
    .join('\n')
    .replace(/\s+$/, '');
  let out = kept === '' ? '' : `${kept}\n`;
  for (const block of blocks) out += `\n${block.body}\n`;
  return out;
}

export function mergeBlocks(
  ownText: string,
  incoming: readonly PatchBlock[],
  overwrite: ReadonlySet<string>,
): { ok: true; text: string; written: string[]; skipped: string[] } | { ok: false; reason: string } {
  const own = patchBlocks(ownText);
  const mine = new Set(own.map((block) => block.key));
  const written: string[] = [];
  const skipped: string[] = [];
  const take: PatchBlock[] = [];
  for (const block of incoming) {
    if (!mine.has(block.key) || overwrite.has(block.key)) {
      take.push(block);
      written.push(block.id);
      continue;
    }
    skipped.push(block.id);
  }
  if (take.length === 0) return { ok: true, text: ownText, written, skipped };
  const replaced = replaceBlocks(ownText, take.filter((block) => mine.has(block.key)));
  const text = appendBlocks(
    replaced,
    take.filter((block) => !mine.has(block.key)),
  );
  const check = patchBlocks(text);
  const expected = new Set([...mine, ...take.map((block) => block.key)]);
  if (check.length !== expected.size || new Set(check.map((block) => block.key)).size !== expected.size) {
    return { ok: false, reason: '写入前的自检没过：行的 id 会重复或丢行' };
  }
  return { ok: true, text, written, skipped };
}

export function readPatchBlocks(
  path: string,
): { ok: true; text: string; blocks: PatchBlock[] } | { ok: false; reason: string } {
  try {
    const text = readFileSync(path, 'utf8');
    return { ok: true, text, blocks: patchBlocks(text) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function patchMode(path: string): number {
  try {
    return statSync(path).mode & 0o777;
  } catch {
    return 0o644;
  }
}

export function writePatchFile(path: string, text: string): void {
  const mode = patchMode(path);
  const tmp = `${path}.wb-sync-${String(process.pid)}`;
  writeFileSync(tmp, text, { mode });
  try {
    renameSync(tmp, path);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      throw error;
    }
    throw error;
  }
}

export interface ConfigSyncDeps {
  readonly home: string;
  readonly self: string;
  readonly profileDir: string | null;
  readonly reconcile?: (() => Promise<boolean | void>) | undefined;
}

export function configSyncHandler(deps: ConfigSyncDeps): RouteHandler {
  return (search) => ({ ok: true, ...configSyncSnapshot(deps, search.get('source') ?? undefined) });
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function profileDependencies(dir: string): ReadonlySet<string> {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, unknown>;
    };
    return new Set(Object.keys(manifest.dependencies ?? {}));
  } catch {
    return new Set();
  }
}

function profileNames(profilesDir: string): readonly string[] {
  try {
    return readdirSync(profilesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((name) => existsSync(join(profilesDir, name, 'package.json')))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function configSyncSnapshot(deps: ConfigSyncDeps, asked?: string): ConfigSyncSnapshot {
  const profilesDir = join(deps.home, 'profiles');
  const names = profileNames(profilesDir);
  const others = names.filter((name) => name !== deps.self);
  const base = {
    self: deps.self,
    home: deps.home,
  };
  if (deps.profileDir === null) {
    return {
      ...base,
      source: '',
      profiles: [],
      rows: [],
      emptyProviders: false,
      reason: '拿不到当前 profile 目录',
    };
  }
  const own = readPatchBlocks(join(deps.profileDir, 'cordis.patch.yml'));
  const emptyProviders = own.ok && !own.blocks.some((block) => block.key.startsWith('id:llm-'));
  const ownBlocks = own.ok ? own.blocks : [];
  const profiles: ConfigSyncProfile[] = others.map((name) => {
    const read = readPatchBlocks(join(profilesDir, name, 'cordis.patch.yml'));
    const blocks = read.ok
      ? read.blocks
          .filter(syncable)
          .map((block) => ({ ...block, body: rewriteForTarget(block.body, deps.self) }))
      : [];
    return {
      name,
      readable: read.ok,
      candidates: read.ok ? syncRows(blocks, ownBlocks, () => []).length : 0,
    };
  });
  if (others.length === 0) {
    return {
      ...base,
      source: '',
      profiles,
      rows: [],
      emptyProviders,
      reason: '这台机器上只有当前这个 profile，没有可同步的来源',
    };
  }
  const source = others.includes(asked ?? '') ? (asked ?? '') : others.includes('web') ? 'web' : (others[0] ?? '');
  const sourceDir = join(profilesDir, source);
  const read = readPatchBlocks(join(sourceDir, 'cordis.patch.yml'));
  if (!read.ok) {
    return { ...base, source, profiles, rows: [], emptyProviders, reason: read.reason };
  }
  if (!own.ok) {
    return { ...base, source, profiles, rows: [], emptyProviders, reason: own.reason };
  }
  const declared = profileDependencies(sourceDir);
  const modulesDir = join(deps.profileDir, 'node_modules');
  const sourceBlocks = read.blocks
    .filter(syncable)
    .map((block) => ({ ...block, body: rewriteForTarget(block.body, deps.self) }));
  const rows = syncRows(sourceBlocks, own.blocks, (block) =>
    block.names.filter((name) => declared.has(name) && !existsSync(join(modulesDir, name))),
  );
  return { ...base, source, profiles, rows, emptyProviders };
}

export async function configSyncApply(
  deps: ConfigSyncDeps,
  payload: unknown,
): Promise<{ ok: true; written: string[]; skipped: string[]; verified: boolean } | { ok: false; text: string }> {
  if (deps.profileDir === null) return { ok: false, text: '拿不到当前 profile 目录，这次没写任何东西' };
  const body = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
  const source = textOf(body['source']);
  const keys = new Set(
    (Array.isArray(body['keys']) ? body['keys'] : []).map((item) => textOf(item)).filter((item) => item !== ''),
  );
  const overwrite = new Set(
    (Array.isArray(body['overwrite']) ? body['overwrite'] : []).map((item) => textOf(item)),
  );
  if (source === '' || keys.size === 0) {
    return { ok: false, text: '没说清从哪个 profile 同步哪几行' };
  }
  const profilesDir = join(deps.home, 'profiles');
  if (!profileNames(profilesDir).includes(source)) return { ok: false, text: `没有这个 profile：${source}` };
  if (source === deps.self) return { ok: false, text: '来源不能是工作台自己' };
  const sourceDir = join(profilesDir, source);
  const read = readPatchBlocks(join(sourceDir, 'cordis.patch.yml'));
  if (!read.ok) return { ok: false, text: `读不到 ${source} 的配置：${read.reason}` };
  const own = readPatchBlocks(join(deps.profileDir, 'cordis.patch.yml'));
  if (!own.ok) return { ok: false, text: `读不到工作台自己的配置：${own.reason}` };
  if (read.blocks.some((block) => block.insert && keys.has(block.key))) {
    return { ok: false, text: '插件行不同步：先把插件装到工作台这边，再同步它的设置' };
  }
  const picked = read.blocks
    .filter((block) => keys.has(block.key) && syncable(block))
    .map((block) => ({ ...block, body: rewriteForTarget(block.body, deps.self) }));
  if (picked.length === 0) {
    return { ok: false, text: '选中的行在来源里已经找不到了，重新读一遍再试' };
  }
  const merged = mergeBlocks(own.text, picked, overwrite);
  if (!merged.ok) return { ok: false, text: merged.reason };
  const patchPath = join(deps.profileDir, 'cordis.patch.yml');
  const patchChanged = merged.text !== own.text;
  try {
    if (patchChanged) writePatchFile(patchPath, merged.text);
  } catch (error) {
    return { ok: false, text: `写不进去：${error instanceof Error ? error.message : String(error)}` };
  }
  if (deps.reconcile === undefined) {
    return { ok: true, written: merged.written, skipped: merged.skipped, verified: false };
  }
  try {
    const verified = await deps.reconcile();
    if (verified === false) {
      return { ok: true, written: merged.written, skipped: merged.skipped, verified: false };
    }
  } catch (error) {
    if (patchChanged) {
      try {
        writePatchFile(patchPath, own.text);
      } catch {
        return { ok: false, text: `写进去了，但启动检查没通过：${error instanceof Error ? error.message : String(error)}。原来的设置没能恢复，手动检查一下` };
      }
    }
    try {
      await deps.reconcile();
    } catch {
      return { ok: false, text: `写进去了，但启动检查没通过：${error instanceof Error ? error.message : String(error)}。已恢复原来的设置` };
    }
    return { ok: false, text: `写进去了，但启动检查没通过：${error instanceof Error ? error.message : String(error)}。已恢复原来的设置` };
  }
  return { ok: true, written: merged.written, skipped: merged.skipped, verified: true };
}

export function configSyncAction(deps: ConfigSyncDeps): PostResource {
  return {
    resource: CONFIG_SYNC_RESOURCE,
    handle: (payload: unknown) => configSyncApply(deps, payload),
  };
}
