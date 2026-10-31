#!/usr/bin/env node
import { execa } from 'execa';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dshHome = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
const workbenchHome = process.env.DSH_WORKBENCH_HOME?.trim() || join(dshHome, 'workbench');
const root = join(workbenchHome, 'opencli');
const isolatedHome = join(root, 'home');
const main = join(root, 'toolchain', 'node_modules', '@jackwener', 'opencli', 'dist', 'src', 'main.js');
const realHome = userInfo().homedir;
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
};
for (const key of Object.keys(env)) {
  if (key.toLowerCase() === 'npm_config_cache') delete env[key];
}
env.npm_config_cache = join(root, 'npm-cache');
const userConfig = join(realHome, '.npmrc');
if (existsSync(userConfig)) env.NPM_CONFIG_USERCONFIG = userConfig;
if (process.versions.electron !== undefined) env.ELECTRON_RUN_AS_NODE = '1';

const child = execa(process.execPath, ['--require', preload, main, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  reject: false,
});
void child
  .then((result) => {
    if (result.signal !== undefined) process.kill(process.pid, result.signal);
    else process.exit(result.exitCode ?? 1);
  })
  .catch((error) => {
    process.stderr.write(`dsh-workbench: opencli 没跑起来：${String(error)}\n`);
    process.exit(1);
  });
