#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseBlocks } from './patch-blocks.mjs';

const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const sourceName = process.env.WB_SOURCE_PROFILE?.trim() || 'web';
const targetName = process.env.WB_TARGET_PROFILE?.trim() || '';
const sourceDir = join(home, 'profiles', sourceName);
const targetDir = join(home, 'profiles', targetName);
const copySettings = process.env.WB_COPY_SETTINGS === '1';

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SKIPPED_IDS = new Set([
  'session-persistence-jsonl',
  'storage-json',
  'attachment-local',
  'sandbox-policy',
]);

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
  let plugins = 0;
  for (const block of sourceBlocks) {
    if (block.insert) {
      plugins += 1;
      continue;
    }
    if (SKIPPED_IDS.has(block.id) || targetKeys.has(block.key)) {
      skipped.push(block.id);
      continue;
    }
    const body = rewritePaths(block.body);
    current = `${current.replace(/\s+$/, '')}\n\n${body}\n`;
    writeFileSync(targetPatch, current, 'utf8');
    targetKeys.add(block.key);
    copied.push(block.id);
  }
  say(`设置行：复制 ${copied.length}，跳过 ${skipped.length}；挂新插件的 ${plugins} 行不同步`);
}

mkdirSync(targetDir, { recursive: true });
if (copySettings) copySettingRows();
say('完成');
