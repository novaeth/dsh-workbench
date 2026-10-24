#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const workbenchHome = process.env.DSH_WORKBENCH_HOME?.trim() || join(dshHome, 'workbench');
const root = join(workbenchHome, 'opencli');
const isolatedHome = join(root, 'home');
const main = join(root, 'toolchain', 'node_modules', '@jackwener', 'opencli', 'dist', 'src', 'main.js');
const realHome = process.env.HOME || process.env.USERPROFILE || homedir();
const preload = join(dirname(fileURLToPath(import.meta.url)), 'opencli-node-mode.cjs');

mkdirSync(isolatedHome, { recursive: true });
if (!existsSync(main)) {
  process.stderr.write(`dsh-workbench: opencli 的隔离运行时还没装好（${join(root, 'toolchain')}）。\n`);
  process.stderr.write('  打开工作台：启动体检会给出一条能直接照做的安装命令。\n');
  process.exit(127);
}

const env = {
  ...process.env,
  HOME: isolatedHome,
  npm_config_cache: join(root, 'npm-cache'),
};
const userConfig = join(realHome, '.npmrc');
if (existsSync(userConfig)) env.NPM_CONFIG_USERCONFIG = userConfig;
if (process.versions.electron !== undefined) env.ELECTRON_RUN_AS_NODE = '1';

const child = spawn(process.execPath, ['--require', preload, main, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  windowsHide: true,
});
child.on('error', (error) => {
  process.stderr.write(`dsh-workbench: opencli 没跑起来：${String(error)}\n`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal !== null) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
