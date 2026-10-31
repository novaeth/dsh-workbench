#!/usr/bin/env node

import { execaSync } from 'execa';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOME = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const PROFILES_DIR = join(HOME, 'profiles');
const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function say(message) {
  process.stdout.write(`${message}\n`);
}

function fail(message) {
  process.stderr.write(`create-workbench: ${message}\n`);
  process.exit(1);
}

function onCancel() {
  process.stdout.write('\n已取消。\n');
  process.exit(130);
}

function listProfiles() {
  try {
    return readdirSync(PROFILES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(PROFILES_DIR, entry.name, 'package.json')))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function uniqueName(base) {
  if (!existsSync(join(PROFILES_DIR, base))) return base;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}${index}`;
    if (!existsSync(join(PROFILES_DIR, candidate))) return candidate;
  }
  fail('找不到可用的新名字，请手动输入一个。');
}

function nameProblem(value, source, profiles) {
  const name = value.trim();
  if (name === '') return '名字不能为空';
  if (!PROFILE_NAME.test(name)) return '只用字母、数字、点、下划线或短横线，且以字母或数字开头';
  if (name === source) return '不能和来源 profile 同名';
  if (profiles.includes(name) || existsSync(join(PROFILES_DIR, name))) return `已经有 profile：${name}`;
  return null;
}

function runSetup(args) {
  const child = execaSync('bash', [join(PKG_ROOT, 'bin', 'dsh-workbench'), ...args], {
    stdio: 'inherit',
    reject: false,
  });
  if (child.failed) fail(child.shortMessage ?? `bash 起不来（退出码 ${child.exitCode ?? '未知'}）`);
  process.exit(child.exitCode ?? 1);
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  fail('这里需要交互终端。脚本或 CI 里请用：setup --from web --profile <名字>');
}

const profiles = listProfiles();

if (profiles.length === 0) {
  say('这台机器还没有 profile；用 dsh 出厂的 web 模板建一个空工作台。');
  const nameAnswer = await prompts(
    {
      type: 'text',
      name: 'name',
      message: '新工作台叫什么？',
      initial: uniqueName('workbench'),
      validate: (value) => nameProblem(String(value), '', profiles) ?? true,
    },
    { onCancel },
  );
  const name = String(nameAnswer.name).trim();
  const confirmAnswer = await prompts(
    {
      type: 'confirm',
      name: 'ok',
      message: `创建 ${name}（dsh 出厂 web 模板，不复制设置）？`,
      initial: true,
    },
    { onCancel },
  );
  if (!confirmAnswer.ok) {
    say('已取消。');
    process.exit(0);
  }
  runSetup(['setup', '--profile', name]);
}

const defaultSource = profiles.includes('web') ? 'web' : profiles[0];
const sourceAnswer = await prompts(
  {
    type: 'select',
    name: 'source',
    message: '用哪个 profile 当模板？',
    choices: profiles.map((name) => ({ title: name, value: name })),
    initial: Math.max(0, profiles.indexOf(defaultSource)),
  },
  { onCancel },
);
const source = sourceAnswer.source;

const defaultName = 'workbench';
const nameAnswer = await prompts(
  {
    type: 'text',
    name: 'name',
    message: '新工作台叫什么？',
    initial: defaultName,
    validate: (value) => nameProblem(String(value), source, profiles) ?? true,
  },
  { onCancel },
);
const name = String(nameAnswer.name).trim();

say('会话、项目、附件跟 web / Desktop 共用一份，不用复制；这里只问设置。');
const copyAnswer = await prompts(
  {
    type: 'confirm',
    name: 'settings',
    message: `从 ${source} 复制已配好的设置（模型、主题等）？`,
    initial: true,
  },
  { onCancel },
);

const confirmAnswer = await prompts(
  {
    type: 'confirm',
    name: 'ok',
    message: `创建 ${name}（来源 ${source}，${copyAnswer.settings ? '复制设置' : '不复制设置'}）？`,
    initial: true,
  },
  { onCancel },
);
if (!confirmAnswer.ok) {
  say('已取消。');
  process.exit(0);
}

const args = ['setup', '--from', source, '--profile', name];
if (!copyAnswer.settings) args.push('--no-settings');

runSetup(args);
