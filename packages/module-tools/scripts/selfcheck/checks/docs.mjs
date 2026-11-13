import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BIN, fillPendingDesign } from '../lib.mjs';

const TITLE = '文档：init 生成用户 README 与作者 DEVELOPING；design render 两份都更新；旧 README 能迁到 DEVELOPING';

function run(args) {
  return execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8', stdio: 'pipe' });
}

function read(dir, file) {
  return readFileSync(join(dir, file), 'utf8');
}

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const probe = mkdtempSync(join(tmpdir(), 'wb-docs-'));
      const problems = [];
      try {
        run(['init', 'demo', '--dir', probe, '--template', 'diy']);
        fillPendingDesign(probe);
        run(['design', 'render', '--cwd', probe]);
        run(['design', 'check', '--cwd', probe]);

        const readme = read(probe, 'README.md');
        const developing = read(probe, 'DEVELOPING.md');
        for (const heading of ['## 卡片上有什么', '## 五种状态', '## agent 能替你做什么', '## 数据从哪来', '## 装和卸', '## 出问题先看']) {
          if (!readme.includes(heading)) problems.push(`README 缺「${heading}」`);
        }
        for (const token of ['src/', 'dsh-wb-module', 'design.json', '路由']) {
          if (readme.includes(token)) problems.push(`README 还带着开发者内容：${token}`);
        }
        if (!developing.includes('## 生成出来的形状')) problems.push('DEVELOPING 缺开发者章节');
        if (!developing.includes('<!-- dsh-wb:design:start -->')) problems.push('DEVELOPING 缺 design 标记');
        if (!developing.includes('### 表 1 面板')) problems.push('DEVELOPING 缺 design 表');

        writeFileSync(join(probe, 'README.md'), '# old module\n\n## 生成出来的形状\n\n旧开发者说明\n');
        unlinkSync(join(probe, 'DEVELOPING.md'));
        run(['design', 'migrate', '--cwd', probe]);
        const migrated = read(probe, 'DEVELOPING.md');
        const user = read(probe, 'README.md');
        if (!migrated.includes('旧开发者说明')) problems.push('migrate 没把旧 README 保存到 DEVELOPING');
        if (!user.includes('## 卡片上有什么')) problems.push('migrate 没重生成用户 README');
        if (!existsSync(join(probe, 'design.json'))) problems.push('design.json 不见了');
      } catch (error) {
        const out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        problems.push(`流程跑红：${out.trim().split('\n').slice(-3).join(' | ')}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(TITLE, problems.length === 0, problems.join(' · '));
    },
  },
];
