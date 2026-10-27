#!/usr/bin/env node

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendBlocks, parseBlocks, removeBlocks } from './patch-blocks.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = dirname(SCRIPT_DIR);
const HOME = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const PROFILE = process.env.WORKBENCH_PROFILE?.trim() || 'workbench';
const PROFILE_DIR = join(HOME, 'profiles', PROFILE);
const RUNTIME_ROOT = process.env.DSH_WORKBENCH_HOME?.trim() || join(HOME, PROFILE);
const PATCH_PATH = join(PROFILE_DIR, 'cordis.patch.yml');
const SANDBOX_PATCH = join(PKG_ROOT, 'profile', 'sandbox.patch.yml');
const MARKER = join(RUNTIME_ROOT, '.data-root-shared');

const DATA_ROOT_IDS = new Set(['session-persistence-jsonl', 'storage-json', 'attachment-local']);
const OWN_ROOT = /DSH_WORKBENCH_HOME|dshHomePath\(\s*['"]workbench/;

function say(message) {
  process.stdout.write(`→ ${message}\n`);
}

function warn(message) {
  process.stderr.write(`dsh-workbench: ${message}\n`);
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function writeAtomic(file, text) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

function mergeTree(from, to, skip = new Set()) {
  let stat;
  try {
    stat = statSync(from);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return 0;
  mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || skip.has(entry.name)) continue;
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) {
      count += mergeTree(source, target);
    } else if (entry.isFile() && !existsSync(target)) {
      copyFileSync(source, target);
      count += 1;
    }
  }
  return count;
}

function unionList(left, right) {
  return [...new Set([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])])];
}

function sessionIdsOf(entry) {
  return Array.isArray(entry?.sessionIds) ? entry.sessionIds : [];
}

function orderedIds(global, table) {
  const seen = new Set();
  const ids = [];
  for (const id of Array.isArray(global?.workspaceIds) ? global.workspaceIds : []) {
    if (table[id] === undefined || seen.has(id)) continue;
    ids.push(id);
    seen.add(id);
  }
  for (const id of Object.keys(table)) {
    if (seen.has(id)) continue;
    ids.push(id);
    seen.add(id);
  }
  return ids;
}

function repairWorkspaceOrder(targetFile) {
  let target;
  try {
    target = JSON.parse(readFileSync(targetFile, 'utf8'));
  } catch {
    return false;
  }
  if (target?.unit?.name !== 'workspace') return false;
  const table = target.tables?.workspaces ?? {};
  const global = target.global ?? {};
  if (global.pendingMutation !== undefined) return false;
  const before = Array.isArray(global.workspaceIds) ? global.workspaceIds : [];
  const seen = new Set();
  const order = [];
  for (const id of before) {
    if (table[id] === undefined || seen.has(id)) continue;
    order.push(id);
    seen.add(id);
  }
  if (global.initialized === true) {
    for (const id of Object.keys(table)) {
      if (seen.has(id)) continue;
      order.push(id);
      seen.add(id);
    }
  }
  if (order.length === before.length && order.every((id, index) => id === before[index])) return false;
  target.global = { ...global, workspaceIds: order };
  writeAtomic(targetFile, `${JSON.stringify(target, null, 2)}\n`);
  return true;
}

function mergeWorkspaceList(sourceFile, targetFile) {
  let source;
  try {
    source = JSON.parse(readFileSync(sourceFile, 'utf8'));
  } catch {
    return 0;
  }
  if (source?.unit?.name !== 'workspace') return 0;
  if (!existsSync(targetFile)) {
    mkdirSync(dirname(targetFile), { recursive: true });
    copyFileSync(sourceFile, targetFile);
    return 1;
  }
  let target;
  try {
    target = JSON.parse(readFileSync(targetFile, 'utf8'));
  } catch {
    warn(`${targetFile} 读不出来，这次没并项目列表，下次启动再试。`);
    return null;
  }
  if (target?.unit?.name !== 'workspace') return 0;
  const sourceTable = source.tables?.workspaces ?? {};
  const targetTable = target.tables?.workspaces ?? {};
  const sourceGlobal = source.global ?? {};
  const targetGlobal = target.global ?? {};
  if (targetGlobal.pendingMutation !== undefined) {
    warn(`${targetFile} 里有一次没做完的项目操作，这次先不并项目列表，下次启动再试。`);
    return null;
  }
  const idByPath = new Map();
  const accounted = new Map();
  for (const [id, entry] of Object.entries(targetTable)) {
    if (typeof entry?.path === 'string') idByPath.set(entry.path, id);
    for (const sessionId of sessionIdsOf(entry)) {
      if (!accounted.has(sessionId)) accounted.set(sessionId, id);
    }
  }
  const order = orderedIds(targetGlobal, targetTable);
  const idMap = new Map();
  let added = 0;
  for (const sourceId of orderedIds(sourceGlobal, sourceTable)) {
    const entry = sourceTable[sourceId];
    if (typeof entry?.path !== 'string') continue;
    const hitId = idByPath.get(entry.path);
    if (hitId !== undefined) {
      const hit = targetTable[hitId];
      const incoming = sessionIdsOf(entry).filter((sessionId) => {
        const holder = accounted.get(sessionId);
        return holder === undefined || holder === hitId;
      });
      hit.sessionIds = unionList(sessionIdsOf(hit), incoming);
      for (const sessionId of hit.sessionIds) {
        if (!accounted.has(sessionId)) accounted.set(sessionId, hitId);
      }
      if (typeof entry.updatedAt === 'string' && (typeof hit.updatedAt !== 'string' || entry.updatedAt > hit.updatedAt)) {
        hit.updatedAt = entry.updatedAt;
      }
      idMap.set(sourceId, hitId);
      continue;
    }
    let newId = sourceId;
    if (targetTable[newId] !== undefined) newId = randomUUID();
    const sessionIds = [];
    for (const sessionId of sessionIdsOf(entry)) {
      if (accounted.has(sessionId)) continue;
      accounted.set(sessionId, newId);
      sessionIds.push(sessionId);
    }
    targetTable[newId] = { ...entry, sessionIds };
    idByPath.set(entry.path, newId);
    order.push(newId);
    added += 1;
  }
  const preferred = targetGlobal.defaultWorkspaceId;
  const fromSource = idMap.get(sourceGlobal.defaultWorkspaceId) ?? sourceGlobal.defaultWorkspaceId;
  const defaultWorkspaceId =
    typeof preferred === 'string' && targetTable[preferred] !== undefined
      ? preferred
      : typeof fromSource === 'string' && targetTable[fromSource] !== undefined
        ? fromSource
        : undefined;
  target.tables = { ...(target.tables ?? {}), workspaces: targetTable };
  target.global = {
    ...targetGlobal,
    workspaceIds: order,
    archivedSessionIds: unionList(targetGlobal.archivedSessionIds, sourceGlobal.archivedSessionIds),
    pinnedSessionIds: unionList(targetGlobal.pinnedSessionIds, sourceGlobal.pinnedSessionIds),
  };
  if (defaultWorkspaceId === undefined) delete target.global.defaultWorkspaceId;
  else target.global.defaultWorkspaceId = defaultWorkspaceId;
  writeAtomic(targetFile, `${JSON.stringify(target, null, 2)}\n`);
  return added;
}

function repairTarget(targetFile) {
  if (repairWorkspaceOrder(targetFile)) say(`项目顺序里有对不上的条目，已按实际项目重排（${targetFile}）。`);
}

function hasEntries(dir) {
  try {
    return readdirSync(dir).some((name) => name !== '.DS_Store');
  } catch {
    return false;
  }
}

function legacyDataExists() {
  if (resolve(RUNTIME_ROOT) === resolve(HOME)) return false;
  return (
    existsSync(join(RUNTIME_ROOT, 'storages', 'workspace.json')) ||
    hasEntries(join(RUNTIME_ROOT, 'sessions')) ||
    hasEntries(join(RUNTIME_ROOT, 'attachments'))
  );
}

function missingWorkspacePaths() {
  const sourceFile = join(RUNTIME_ROOT, 'storages', 'workspace.json');
  const targetFile = join(HOME, 'storages', 'workspace.json');
  if (!existsSync(sourceFile) || !existsSync(targetFile)) return [];
  let source;
  let target;
  try {
    source = JSON.parse(readFileSync(sourceFile, 'utf8'));
    target = JSON.parse(readFileSync(targetFile, 'utf8'));
  } catch {
    return [];
  }
  if (source?.unit?.name !== 'workspace' || target?.unit?.name !== 'workspace') return [];
  const have = new Set();
  for (const entry of Object.values(target.tables?.workspaces ?? {})) {
    if (typeof entry?.path === 'string') have.add(entry.path);
  }
  const missing = [];
  for (const entry of Object.values(source.tables?.workspaces ?? {})) {
    if (typeof entry?.path !== 'string' || have.has(entry.path)) continue;
    missing.push(typeof entry.title === 'string' && entry.title !== '' ? entry.title : entry.path);
  }
  return missing;
}

function mergeDataRoot() {
  if (resolve(RUNTIME_ROOT) === resolve(HOME)) return { added: 0, files: 0 };
  const targetWorkspace = join(HOME, 'storages', 'workspace.json');
  const sourceStorages = join(RUNTIME_ROOT, 'storages');
  let added;
  let files = 0;
  try {
    added = mergeWorkspaceList(join(sourceStorages, 'workspace.json'), targetWorkspace);
    if (added === null) return null;
    files += mergeTree(join(RUNTIME_ROOT, 'sessions'), join(HOME, 'sessions'));
    files += mergeTree(join(RUNTIME_ROOT, 'attachments'), join(HOME, 'attachments'));
    files += mergeTree(sourceStorages, join(HOME, 'storages'), new Set(['workspace.json']));
  } catch (error) {
    warn(`并回 ${HOME} 时出错：${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  repairTarget(targetWorkspace);
  return { added, files };
}

function writeMarker() {
  mkdirSync(dirname(MARKER), { recursive: true });
  writeFileSync(
    MARKER,
    `${JSON.stringify({ at: new Date().toISOString(), from: RUNTIME_ROOT, to: HOME }, null, 2)}\n`,
    'utf8',
  );
}

function inspectProfile() {
  const patch = readText(PATCH_PATH);
  if (patch === null) return null;
  const legacy = parseBlocks(patch).filter((block) => DATA_ROOT_IDS.has(block.id));
  return {
    patch,
    ours: legacy.filter((block) => OWN_ROOT.test(block.body)),
    custom: legacy.filter((block) => !OWN_ROOT.test(block.body)),
  };
}

function customRootMessage(state) {
  return `${PROFILE} 的会话 / 存储根是你自己改过的（${state.custom.map((block) => block.id).join(' / ')}）—— 这次不动它，也不并数据。`;
}

function applySharedConfig(state) {
  if (state.custom.length > 0) {
    warn(customRootMessage(state));
    return false;
  }
  let patch = state.patch;
  if (state.ours.length > 0) {
    const first = Math.min(...state.ours.map((block) => block.lineStart));
    patch = stripIsolationHeader(patch, first);
    patch = removeBlocks(patch, (block) => DATA_ROOT_IDS.has(block.id) && OWN_ROOT.test(block.body));
    writeAtomic(PATCH_PATH, patch);
    say(`数据根改回共用：从 ${PROFILE} 的 profile 里去掉 ${state.ours.map((block) => block.id).join(' / ')}。`);
  }
  const hasSandbox = parseBlocks(patch).some((block) => block.id === 'sandbox-policy');
  if (!hasSandbox) {
    const sandbox = readText(SANDBOX_PATCH);
    const row = sandbox === null ? undefined : parseBlocks(sandbox).find((block) => block.id === 'sandbox-policy');
    if (row !== undefined) {
      patch = appendBlocks(patch, row.body);
      writeAtomic(PATCH_PATH, patch);
    }
  }
  repairTarget(join(HOME, 'storages', 'workspace.json'));
  return true;
}

function configureDefault() {
  const state = inspectProfile();
  if (state === null) return;
  if (state.custom.length > 0) {
    warn(customRootMessage(state));
    return;
  }
  if (legacyDataExists() && !existsSync(MARKER)) {
    warn(`检测到 ${RUNTIME_ROOT} 里还有旧会话 / 项目 / 附件，这次没有自动并。`);
    warn('要切到共用数据根，先退出所有 dsh，再运行: dsh-workbench migrate');
    return;
  }
  applySharedConfig(state);
}

function migrate() {
  const state = inspectProfile();
  if (state === null) {
    warn(`找不到 ${PATCH_PATH}，先运行 dsh-workbench setup。`);
    return 1;
  }
  if (state.custom.length > 0) {
    warn(customRootMessage(state));
    return 1;
  }
  if (!legacyDataExists()) {
    applySharedConfig(state);
    say(`没有发现 ${RUNTIME_ROOT} 里的旧数据，数据根已经是共用的。`);
    return 0;
  }
  if (existsSync(MARKER) && !FORCE) {
    const missing = missingWorkspacePaths();
    if (missing.length > 0) {
      say(`已经迁过一次；旧目录里还有 ${missing.length} 个项目不在共用根：${missing.join('、')}。要补并加 --force（这次 profile 保持原样）。`);
      return 0;
    }
    applySharedConfig(state);
    say('已经迁过一次；要再并一次加 --force。');
    return 0;
  }
  warn('迁移前先退出所有 dsh（:3080 / :3081）；否则正在运行的实例可能覆盖刚并好的数据。');
  const result = mergeDataRoot();
  if (result === null) {
    warn('这次没有迁移；profile 和旧数据都保持原样。');
    return 1;
  }
  writeMarker();
  applySharedConfig(state);
  say(`迁移完成：新增 ${result.added} 个项目，补了 ${result.files} 个文件；旧目录保留。`);
  return 0;
}

function stripIsolationHeader(text, blockStart) {
  const lines = text.split('\n');
  let marker = -1;
  for (let i = blockStart - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? '';
    if (/^#.*会话\s*\/\s*存储隔离层/.test(line)) {
      marker = i;
      break;
    }
    if (line.trim() !== '' && !line.startsWith('#')) break;
  }
  if (marker === -1) return text;
  lines.splice(marker, blockStart - marker);
  return lines.join('\n');
}

const MIGRATE = process.argv.includes('--migrate') || process.argv.includes('migrate');
const FORCE = process.argv.includes('--force');

const profileManifest = join(PROFILE_DIR, 'package.json');
if (!existsSync(profileManifest)) process.exit(0);

if (MIGRATE) process.exit(migrate());
configureDefault();
