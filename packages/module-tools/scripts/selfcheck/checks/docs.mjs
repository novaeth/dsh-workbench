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
        if (!existsSync(join(probe, 'readme.json'))) problems.push('init 没生成 readme.json');
        fillPendingDesign(probe);
        run(['design', 'render', '--cwd', probe]);
        run(['design', 'check', '--cwd', probe]);

        const readme = read(probe, 'README.md');
        const developing = read(probe, 'DEVELOPING.md');
        for (const heading of ['## 你会看到什么', '## 你能做什么', '## agent 能替你做什么', '## 数据从哪来', '## 装和卸', '## 出问题先看']) {
          if (!readme.includes(heading)) problems.push(`README 缺「${heading}」`);
        }
        for (const token of ['src/', 'dsh-wb-module', 'design.json', '路由']) {
          if (readme.includes(token)) problems.push(`README 还带着开发者内容：${token}`);
        }
        const drawn = read(probe, 'README.md');
        if (!drawn.includes('## 长这样')) problems.push('README 缺「长这样」那一节');
        if (!drawn.includes('```text') || !drawn.includes('│ ● 标题 │')) problems.push('卡片图没画进 README');
        if (!/## 你会看到什么\n\n- 填好/.test(drawn)) problems.push('正文没按条目渲染');

        const noShot = JSON.parse(read(probe, 'readme.json'));
        noShot.shots = [];
        writeFileSync(join(probe, 'readme.json'), JSON.stringify(noShot, null, 2));
        let shotFailure = '';
        try {
          run(['design', 'check', '--cwd', probe]);
        } catch (error) {
          shotFailure = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        }
        if (!shotFailure.includes('shots 是空的')) problems.push('没画图时 design check 没拦住');
        noShot.shots = [{ caption: '卡片', ascii: '┌─ 卡片 ─┐\n│ ● 标题 │\n└────────┘' }];
        writeFileSync(join(probe, 'readme.json'), JSON.stringify(noShot, null, 2));
        run(['design', 'render', '--cwd', probe]);
        run(['design', 'check', '--cwd', probe]);

        if (!developing.includes('## 生成出来的形状')) problems.push('DEVELOPING 缺开发者章节');
        if (!developing.includes('<!-- dsh-wb:design:start -->')) problems.push('DEVELOPING 缺 design 标记');
        if (!developing.includes('### 表 1 面板')) problems.push('DEVELOPING 缺 design 表');

        const design = JSON.parse(read(probe, 'design.json'));
        design.oneLine = 'ENGINEERING_ONLY_SENTINEL';
        writeFileSync(join(probe, 'design.json'), JSON.stringify(design, null, 2));
        run(['design', 'render', '--cwd', probe]);
        if (read(probe, 'README.md').includes('ENGINEERING_ONLY_SENTINEL')) {
          problems.push('README 把 design.json 的工程字段带进来了');
        }
        run(['design', 'check', '--cwd', probe]);

        const source = JSON.parse(read(probe, 'readme.json'));
        source.see = '打开 src/host.ts 看';
        writeFileSync(join(probe, 'readme.json'), JSON.stringify(source, null, 2));
        let copyFailure = '';
        try {
          run(['design', 'check', '--cwd', probe]);
        } catch (error) {
          copyFailure = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        }
        if (!copyFailure.includes('源码路径')) problems.push('用户文案里的源码路径没被 point 出来');
        source.see = '填好';
        writeFileSync(join(probe, 'readme.json'), JSON.stringify(source, null, 2));
        run(['design', 'render', '--cwd', probe]);
        run(['design', 'check', '--cwd', probe]);

        writeFileSync(join(probe, 'README.md'), '# old module\n\n## 生成出来的形状\n\n旧开发者说明\n');
        unlinkSync(join(probe, 'DEVELOPING.md'));
        run(['design', 'migrate', '--cwd', probe]);
        const migrated = read(probe, 'DEVELOPING.md');
        const user = read(probe, 'README.md');
        if (!migrated.includes('旧开发者说明')) problems.push('migrate 没把旧 README 保存到 DEVELOPING');
        if (!user.includes('## 你会看到什么')) problems.push('migrate 没重生成用户 README');
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
