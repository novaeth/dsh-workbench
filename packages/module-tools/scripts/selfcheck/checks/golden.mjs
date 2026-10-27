import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { BIN, HELLO, PKG_ROOT, read } from '../lib.mjs';

const TITLE = '构建产出与黄金文件逐字一致（loader 壳、JSX 工厂、external 白名单没漂）';

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {

      try {
        execFileSync(process.execPath, [BIN, 'build'], {
          cwd: HELLO,
          stdio: 'pipe',
        });
      } catch (error) {
        const out = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
        report(
          TITLE,
          false,
          `module-hello 构建失败：${out || error.message}（改了就说明为什么，并更新 test/golden）`,
        );
        return;
      }

      const golden = read(join(PKG_ROOT, 'test/golden/module-hello.client.body.js'));
      const body = read(join(HELLO, 'client.js')).split('\n').slice(1).join('\n');
      report(
        TITLE,
        body === golden,
        body === golden
          ? ''
          : '产物正文与黄金文件不一致（loader 壳 / JSX 工厂 / external 白名单 / 缩进 任一改动都会触发；改了就说明为什么，并更新 test/golden）',
      );
    },
  },
];
