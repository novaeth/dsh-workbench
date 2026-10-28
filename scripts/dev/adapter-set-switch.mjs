import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const has = (name) => args.includes(name);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const profile = flag('--profile') ?? 'desktop';
const profileDir = flag('--profile-dir') ?? join(home, 'profiles', profile);
const patchPath = join(profileDir, 'cordis.patch.yml');
const backupPath = `${patchPath}.adapter-switch.bak`;
const spec = flag('--spec') ?? '@dsh-workbench/adapters-chrome-mcp';

if (!existsSync(patchPath)) {
  console.error(`没有这个 profile 的 patch：${patchPath}`);
  process.exit(1);
}

const BLOCK = /^- id: workbench\n(?:[ \t].*\n)*/m;

function withoutWorkbench(text) {
  return text.replace(BLOCK, '');
}

if (has('--restore')) {
  if (!existsSync(backupPath)) {
    console.error(`没有备份，无从还原：${backupPath}`);
    process.exit(1);
  }
  copyFileSync(backupPath, patchPath);
  unlinkSync(backupPath);
  const scopeDir = join(profileDir, 'node_modules', '@dsh-workbench');
  for (const name of ['adapters-chrome-mcp']) {
    const link = join(scopeDir, name);
    if (existsSync(link)) unlinkSync(link);
  }
  console.log(`已还原 ${patchPath}，并摘掉临时链进去的集合`);
  process.exit(0);
}

const packageName = spec.startsWith('@dsh-workbench/') ? spec.slice('@dsh-workbench/'.length) : undefined;
if (packageName !== undefined && !has('--dry')) {
  const source = join(repoRoot, 'packages', packageName);
  if (!existsSync(source)) {
    console.error(`本仓没有这个包：${source}`);
    process.exit(1);
  }
  const scopeDir = join(profileDir, 'node_modules', '@dsh-workbench');
  mkdirSync(scopeDir, { recursive: true });
  const link = join(scopeDir, packageName);
  if (existsSync(link)) unlinkSync(link);
  symlinkSync(source, link, 'dir');
  console.log(`已把 ${spec} 链进 profile：${link}`);
}

const original = readFileSync(patchPath, 'utf8');
const next = `${withoutWorkbench(original).replace(/\s*$/, '\n')}\n- id: workbench\n  config:\n    adapterSet: '${spec}'\n`;

if (has('--dry')) {
  console.log('--- 会写成这样 ---');
  console.log(next.split('\n').filter((line) => line.includes('workbench') || line.includes('adapterSet')).join('\n'));
  process.exit(0);
}

if (!existsSync(backupPath)) {
  copyFileSync(patchPath, backupPath);
  chmodSync(backupPath, 0o600);
  console.log(`已备份原始 patch：${backupPath}`);
}
writeFileSync(patchPath, next);
console.log(`已把 ${profile} 的适配器集合指向 ${spec}`);
console.log('重启工作台生效；要回滚：node scripts/dev/adapter-set-switch.mjs --restore --profile ' + profile);
