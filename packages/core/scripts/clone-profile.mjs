#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const sourceName = process.env.WB_SOURCE_PROFILE?.trim() || 'web';
const targetName = process.env.WB_TARGET_PROFILE?.trim() || '';
const sourceDir = join(home, 'profiles', sourceName);
const targetDir = join(home, 'profiles', targetName);
const sourceCandidate = join(home, sourceName);
const sourcePatchForHome = join(sourceDir, 'cordis.patch.yml');
const sourcePatchText = existsSync(sourcePatchForHome) ? readText(sourcePatchForHome) : '';
const sourceHasIsolation = /id:\s*session-persistence-jsonl/.test(sourcePatchText);
const sourceHome =
  process.env.WB_SOURCE_HOME?.trim() ||
  (!sourceHasIsolation
    ? home
    : sourcePatchText.includes('DSH_WORKBENCH_HOME') && sourceName !== 'workbench'
      ? sourceCandidate
      : join(home, 'workbench'));
const targetHome = process.env.DSH_WORKBENCH_HOME?.trim() || join(home, targetName);
const copySettings = process.env.WB_COPY_SETTINGS === '1';
const copyPlugins = process.env.WB_COPY_PLUGINS === '1';
const copyProjects = process.env.WB_COPY_PROJECTS === '1';
const copySessions = process.env.WB_COPY_SESSIONS === '1';

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ISOLATION_IDS = new Set([
  'session-persistence-jsonl',
  'storage-json',
  'attachment-local',
  'sandbox-policy',
]);
const ASSET_MAX_BYTES = 8 * 1024 * 1024;
const ASSET_MAX_FILES = 500;
const ASSET_SKIP = new Set(['node_modules', '.git', '.DS_Store']);

function say(message) {
  process.stdout.write(`→ ${message}\n`);
}

function fail(message) {
  process.stderr.write(`clone-profile: ${message}\n`);
  process.exit(1);
}

if (!PROFILE_NAME.test(sourceName)) fail(`来源 profile 名不合法：${sourceName}`);
if (!PROFILE_NAME.test(targetName)) fail(`目标 profile 名不合法：${targetName}`);
if (sourceName === targetName) fail('来源和目标不能是同一个 profile');
if (!existsSync(join(sourceDir, 'package.json'))) fail(`没有来源 profile：${sourceDir}`);
if (!existsSync(targetDir)) fail(`目标 profile 还没建好：${targetDir}`);

function readText(file) {
  return readFileSync(file, 'utf8');
}

if (copySettings && !copyPlugins) {
  const refs = localPluginRefs();
  if (refs > 0) {
    fail(`设置里有 ${refs} 个本地插件文件引用；不能只复制设置不复制插件（会指向不存在的文件）。要么一起复制插件，要么取消设置。`);
  }
}

function parseBlocks(text) {
  const lines = text.split('\n');
  const starts = [];
  lines.forEach((line, index) => {
    if (/^- /.test(line) || line === '-') starts.push(index);
  });
  const blocks = [];
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i];
    const to = i + 1 < starts.length ? starts[i + 1] : lines.length;
    let end = to;
    while (end > from && (lines[end - 1] ?? '').trim() === '') end -= 1;
    const body = lines.slice(from, end).join('\n');
    if (body.trim() === '') continue;
    const first = body.split('\n')[0] ?? '';
    const id = /^- id:[ \t]*"?([^"\s#]+)/.exec(first)?.[1];
    const insert = id === undefined && /^- insert:[ \t]*$/.test(first);
    const nested = body
      .split('\n')
      .map((line) => /^[ \t]+-[ \t]*id:[ \t]*"?([^"\s#]+)/.exec(line)?.[1])
      .filter(Boolean);
    const key = id !== undefined ? `id:${id}` : insert ? `insert:${nested.join(', ')}` : `block:${String(i)}`;
    blocks.push({ key, id: id ?? nested.join(', ') ?? key, insert, body });
  }
  return blocks;
}

function namesOf(body) {
  return body
    .split('\n')
    .map((line) => /^[ \t]*-?[ \t]*name:[ \t]*['"]?([^'"\s#]+)/.exec(line)?.[1])
    .filter((name) => name !== undefined && (name.startsWith('./') || name.startsWith('../') || name.startsWith('file://') || isAbsolute(name)));
}

function insideProfile(dir, ref) {
  if (ref.startsWith('file://')) return null;
  if (!ref.startsWith('./') && !ref.startsWith('../') && !isAbsolute(ref)) return null;
  const abs = resolve(dir, ref);
  const rel = relative(dir, abs);
  if (rel === '' || rel === '..' || rel.startsWith(`..${requireSep()}`) || isAbsolute(rel)) return null;
  return { rel: rel.split(requireSep()).join('/'), abs };
}

function requireSep() {
  return process.platform === 'win32' ? '\\' : '/';
}

function copyFileAsset(source, target, budget) {
  const stat = statSync(source);
  if (stat.isSymbolicLink() || !stat.isFile()) return false;
  if (stat.size > ASSET_MAX_BYTES) return false;
  budget.bytes += stat.size;
  if (budget.bytes > 32 * 1024 * 1024 || budget.files >= ASSET_MAX_FILES) return false;
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target);
  budget.files += 1;
  return true;
}

function copyDirAsset(source, target, budget) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (ASSET_SKIP.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isSymbolicLink()) return false;
      if (entry.isDirectory()) {
        if (!walk(abs)) return false;
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(source, abs);
      if (!copyFileAsset(abs, join(target, rel), budget)) return false;
    }
    return true;
  };
  return walk(source);
}

function localPluginRefs() {
  const sourcePatch = join(sourceDir, 'cordis.patch.yml');
  if (!existsSync(sourcePatch)) return 0;
  const seen = new Set();
  for (const block of parseBlocks(readText(sourcePatch))) {
    if (!block.insert) continue;
    for (const ref of namesOf(block.body)) {
      const located = insideProfile(sourceDir, ref);
      if (located !== null) seen.add(located.rel);
    }
  }
  return seen.size;
}

function rewritePaths(body) {
  return body.replace(/(dshHomePath\(\s*['"])workbench(?=[/'"])/g, `$1${targetName}`);
}

function copySettingRows() {
  const sourcePatch = join(sourceDir, 'cordis.patch.yml');
  const targetPatch = join(targetDir, 'cordis.patch.yml');
  if (!existsSync(sourcePatch)) {
    say('来源没有 cordis.patch.yml，跳过设置复制');
    return;
  }
  const sourceBlocks = parseBlocks(readText(sourcePatch));
  const initial = existsSync(targetPatch) ? readText(targetPatch) : '';
  let current = initial.replace(/^\s*\[\]\s*$/m, '');
  const targetKeys = new Set(parseBlocks(current).map((block) => block.key));
  const copied = [];
  const skipped = [];
  for (const block of sourceBlocks) {
    if (ISOLATION_IDS.has(block.id) || targetKeys.has(block.key)) {
      skipped.push(block.id);
      continue;
    }
    const body = rewritePaths(block.body);
    current = `${current.replace(/\s+$/, '')}\n\n${body}\n`;
    writeFileSync(targetPatch, current, 'utf8');
    targetKeys.add(block.key);
    copied.push(block.id);
  }
  say(`设置行：复制 ${copied.length}，跳过 ${skipped.length}`);
}

function copyPluginAssets() {
  const sourcePatch = join(sourceDir, 'cordis.patch.yml');
  if (!existsSync(sourcePatch)) return;
  const budget = { bytes: 0, files: 0 };
  const seen = new Set();
  let copied = 0;
  for (const block of parseBlocks(readText(sourcePatch))) {
    if (!block.insert || ISOLATION_IDS.has(block.id)) continue;
    for (const ref of namesOf(block.body)) {
      const located = insideProfile(sourceDir, ref);
      if (located === null || seen.has(located.rel)) continue;
      seen.add(located.rel);
      const source = join(sourceDir, located.rel);
      const target = join(targetDir, located.rel);
      if (!existsSync(source)) {
        say(`缺文件，跳过：${located.rel}`);
        continue;
      }
      const stat = statSync(source);
      const ok = stat.isDirectory()
        ? copyDirAsset(source, target, budget)
        : copyFileAsset(source, target, budget);
      if (ok) copied += 1;
      else say(`文件太大或含符号链接，跳过：${located.rel}`);
    }
  }
  say(`本地插件文件：复制 ${copied} 个`);
}

function copyProjectList() {
  const source = join(sourceHome, 'storages', 'workspace.json');
  if (!existsSync(source)) {
    say('来源没有项目列表，跳过');
    return;
  }
  const target = join(targetHome, 'storages', 'workspace.json');
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target);
  say('项目列表：已复制');
}

function copySessionData() {
  const source = join(sourceHome, 'sessions');
  if (!existsSync(source)) {
    say('来源没有会话记录，跳过');
    return;
  }
  const target = join(targetHome, 'sessions');
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
  say('会话记录：已复制');
  const attachments = join(sourceHome, 'attachments');
  if (existsSync(attachments)) cpSync(attachments, join(targetHome, 'attachments'), { recursive: true });
}

function mergeDependencies() {
  const sourceManifest = JSON.parse(readText(join(sourceDir, 'package.json')));
  const targetManifest = JSON.parse(readText(join(targetDir, 'package.json')));
  const sourceDeps = sourceManifest.dependencies ?? {};
  const targetDeps = targetManifest.dependencies ?? {};
  const merged = { ...targetDeps };
  for (const [name, spec] of Object.entries(sourceDeps)) {
    if (name === '@dsh-workbench/core') continue;
    if (!Object.hasOwn(merged, name)) merged[name] = spec;
  }
  targetManifest.dependencies = merged;
  const tmp = `${join(targetDir, 'package.json')}.wb-clone`;
  writeFileSync(tmp, `${JSON.stringify(targetManifest, null, 2)}\n`, 'utf8');
  renameSync(tmp, join(targetDir, 'package.json'));
  say(`依赖：并入 ${Object.keys(merged).length - Object.keys(targetDeps).length} 项`);
}

mkdirSync(targetDir, { recursive: true });
mkdirSync(targetHome, { recursive: true });
if (copySettings) copySettingRows();
if (copyPlugins) copyPluginAssets();
mergeDependencies();
if (copyProjects) copyProjectList();
if (copySessions) copySessionData();
say('完成');
