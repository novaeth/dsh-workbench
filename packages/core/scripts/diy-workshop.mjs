import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const PROFILE = process.env.WORKBENCH_PROFILE ?? 'workbench';
const PORT = process.env.WORKBENCH_PORT ?? '3081';
const BASE = `http://127.0.0.1:${PORT}/workbench/api`;

const WORKSHOP = join(HOME, 'workbench', 'diy');
const MODULES_DIR = join(WORKSHOP, 'packages');
const PROFILE_MANIFEST = join(HOME, 'profiles', PROFILE, 'package.json');

function die(message) {
  console.error(`diy-workshop: ${message}`);
  process.exit(1);
}

async function post(path, body) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    die(`连不上工作台（${BASE}）—— 它在跑吗？${error instanceof Error ? error.message : String(error)}`);
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    die(`${path} 回的不是 JSON（HTTP ${response.status}）：${text.slice(0, 200)}`);
  }
}

function workshopModules() {
  if (!existsSync(MODULES_DIR)) return [];
  return readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = join(MODULES_DIR, entry.name);
      const manifestPath = join(dir, 'package.json');
      if (!existsSync(manifestPath)) return [];
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const unit = manifest.dsh?.workbench?.unit;
      if (typeof unit !== 'string' || unit === '') return [];
      return [{ dir, unit, name: String(manifest.name ?? ''), description: String(manifest.description ?? '') }];
    })
    .sort((left, right) => left.unit.localeCompare(right.unit));
}

function workshopPathOf(dir) {
  const real = existsSync(dir) ? realpathSync(dir) : resolve(dir);
  const root = existsSync(MODULES_DIR) ? realpathSync(MODULES_DIR) : resolve(MODULES_DIR);
  if (real !== root && !real.startsWith(root + sep)) {
    die(`只接工坊里的模块（${MODULES_DIR} 之下），这个不在：${real}`);
  }
  return real;
}

function installedNames() {
  if (!existsSync(PROFILE_MANIFEST)) return new Set();
  const manifest = JSON.parse(readFileSync(PROFILE_MANIFEST, 'utf8'));
  return new Set(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }));
}

function verdictOf(change, verb = '装') {
  const application = change?.application ?? 'failed';
  const target = change?.target ?? '';
  const tail = (change?.packageResult?.output ?? '').trim().split('\n').slice(-3).join(' | ');
  if (application === 'applied') return verb === '卸' ? `卸下了（${target}）` : `装好了（${target}）`;
  if (application === 'restart-required') {
    return `要重启才能生效（${target}）—— 同名重装 / 替换已有包都走这一支；迭代只该重建，不该再装一次`;
  }
  if (application === 'overridden') return `被更高层的声明盖住了（${target}）`;
  if (application === 'cancelled') return `安装被取消（${target}）`;
  return `${verb}失败（${target}）：${tail}`;
}

const [command, target] = process.argv.slice(2);
const workspaceAt = process.argv.indexOf('--workspace');
const workspace = workspaceAt === -1 ? undefined : process.argv[workspaceAt + 1];

if (command === 'list' || command === undefined) {
  const modules = workshopModules();
  const installed = installedNames();
  if (modules.length === 0) {
    console.log(`工坊是空的（${MODULES_DIR}）—— 让 agent 在里面造一个（dsh-wb-module init <名字> --template diy）`);
  }
  for (const one of modules) {
    const mark = installed.has(one.name) ? '已装' : '没装';
    console.log(`${one.unit.padEnd(18)} ${mark}  ${one.name}`);
    if (one.description !== '') console.log(`${' '.repeat(18)}      ${one.description}`);
  }
  console.log(`\n工坊：${MODULES_DIR}`);
  process.exit(0);
}

const found = workshopModules().find((one) => one.unit === target);
if (found === undefined) die(`工坊里没有单元 id 为「${String(target)}」的模块（先跑一次 list）`);

if (command === 'install') {
  const spec = workshopPathOf(found.dir);
  console.log(`① 装上：${found.name}`);
  const installed = await post('/provision', { action: 'install-bundle', spec });
  if (installed.ok !== true) die(`安装接口回了失败：${JSON.stringify(installed).slice(0, 300)}`);
  console.log(`   ${verdictOf(installed.change)}`);

  if (workspace === undefined) {
    console.log('② 没给 --workspace，跳过"打开"这一步。');
    console.log('   ⚠️ 跳过它 = 用户面板上什么都不会出现（面板配置按工作区存，默认全空）。');
  } else {
    console.log(`② 打开：工作区 ${workspace}`);
    const shown = await post('/prefs/panels', { action: 'show', id: found.unit, path: workspace });
    if (shown.ok !== true) {
      console.log(`   打不开：${shown.error?.message ?? JSON.stringify(shown).slice(0, 200)}`);
      console.log('   （"这个会话不属于任何工作区" = 那个目录还不是工作台的工作区，先让用户在左栏加上它）');
    } else {
      const row = (shown.units ?? []).find((unit) => unit.id === found.unit);
      console.log(`   ${row?.shown === true ? '面板上已经打开它了' : '没打开（回包里没有它）'}`);
    }
  }
  process.exit(0);
}

if (command === 'remove') {
  console.log(`卸下：${found.name}`);
  const removed = await post('/provision', { action: 'remove-bundle', name: found.name });
  if (removed.ok !== true) die(`卸载接口回了失败：${JSON.stringify(removed).slice(0, 300)}`);
  console.log(`   ${verdictOf(removed.change, '卸')}`);
  console.log(`   留着的东西：${(removed.change?.keptFor ?? []).join('、') || '无'}`);
  process.exit(0);
}

die(`不认识的命令：${String(command)}（可用：list / install / remove）`);
