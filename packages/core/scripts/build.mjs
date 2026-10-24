import { copyFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { build } from 'vite';

const stageDir = process.env.WB_STAGE_DIR === '' ? undefined : process.env.WB_STAGE_DIR;
if (stageDir !== undefined && !isAbsolute(stageDir)) {
  throw new Error(`WB_STAGE_DIR 必须是绝对路径（收到 ${stageDir}）`);
}

function shipStyleContract() {
  const distDir = stageDir === undefined ? 'dist' : join(stageDir, 'dist');
  mkdirSync(distDir, { recursive: true });
  copyFileSync('src/shared/styles/board.css', join(distDir, 'board.css'));
  console.log(`${distDir}/board.css 已生成（模块借类的契约，随包出货）`);
}

const target = process.argv[2];

if (target === undefined || target === 'host') {
  await build({ root: process.cwd(), mode: 'host', logLevel: 'warn' });
  console.log(`${stageDir === undefined ? 'dist/host' : join(stageDir, 'dist/host')}/index.js 已生成`);
}

if (target === undefined || target === 'client') {
  await build({ root: process.cwd(), mode: 'client', logLevel: 'warn' });
  shipStyleContract();
}
