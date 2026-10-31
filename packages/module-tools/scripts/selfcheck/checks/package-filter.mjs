import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BIN } from '../lib.mjs';

const TITLE = '--package 只过滤“别的包”的问题：全局配置错（没有包名前缀）仍然判红，不把红翻成绿';

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const root = mkdtempSync(join(tmpdir(), 'dsh-wb-package-filter-'));
      const problems = [];
      try {
        const pkg = join(root, 'packages', 'one');
        mkdirSync(pkg, { recursive: true });
        writeFileSync(
          join(pkg, 'package.json'),
          `${JSON.stringify({ name: '@demo/one', version: '0.0.0', dsh: { workbench: { unit: 'one', apiVersion: 3 } } }, null, 2)}\n`,
        );
        let code = 0;
        let output = '';
        try {
          output = execFileSync(process.execPath, [BIN, 'check', '--only', 'markers', '--package', 'one'], {
            cwd: root,
            env: { ...process.env, DSH_WB_ROOT: root, DSH_WB_INTERNAL_MARKERS: 'not-json' },
            stdio: 'pipe',
            encoding: 'utf8',
          });
        } catch (error) {
          code = typeof error.status === 'number' ? error.status : 1;
          output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        }
        if (code === 0) problems.push('全局配置错被 --package 翻成了绿（退出码 0）');
        if (!/internal-markers|标记|JSON/i.test(output)) problems.push(`没有把全局错报出来：${output.slice(0, 200)}`);
      } catch (error) {
        problems.push(String(error?.message ?? error).split('\n')[0]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
      report(TITLE, problems.length === 0, problems.join(' · '));
    },
  },
];
