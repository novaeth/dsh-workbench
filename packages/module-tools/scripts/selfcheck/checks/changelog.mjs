import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addChangelog, changelogProblemOf, initChangelog, readChangelogText } from '../../../src/changelog.mjs';

function packageOf(version = '0.1.0') {
  const dir = mkdtempSync(join(tmpdir(), 'wb-changelog-'));
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: '@demo/probe', version }, null, 2)}\n`);
  return dir;
}

function withDir(run) {
  const dir = packageOf();
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const checks = [
  {
    title: 'changelog：init 建骨架，add 记一版，check 认这一版',
    run(_ctx, report) {
      const title = 'changelog：init 建骨架，add 记一版，check 认这一版';
      withDir((dir) => {
        try {
          if (changelogProblemOf(dir, '0.1.0') === undefined) throw new Error('没文件时居然说通过');
          const init = initChangelog(dir);
          if (!init.created) throw new Error('init 没建文件');
          if (readChangelogText(dir) !== '# 更新日志\n') throw new Error('骨架不对');
          const problem = changelogProblemOf(dir, '0.1.0');
          if (problem === undefined || !problem.command.includes('changelog add 0.1.0')) {
            throw new Error('空骨架没拦住');
          }
          addChangelog(dir, { version: '0.1.0', kind: 'added', note: '第一个版本', date: '2026-10-26' });
          if (changelogProblemOf(dir, '0.1.0') !== undefined) throw new Error('写了还不认');
          if (changelogProblemOf(dir, '0.2.0') === undefined) throw new Error('别的版本居然认了');
          const text = readChangelogText(dir);
          if (!text.includes('## v0.1.0')) throw new Error('版本标题不对');
          if (!text.includes('`2026-10-26`')) throw new Error('日期行不对');
          if (!text.includes('### ✨ 新增')) throw new Error('分类标题不对');
          if (!text.includes('- 第一个版本')) throw new Error('条目没写进去');
          report(title, true);
        } catch (error) {
          report(title, false, error.message.slice(0, 200));
        }
      });
    },
  },
  {
    title: 'changelog：省略版本用 package.json；重复 add 往同一段里追加',
    run(_ctx, report) {
      const title = 'changelog：省略版本用 package.json；重复 add 往同一段里追加';
      withDir((dir) => {
        try {
          const first = addChangelog(dir, { note: '第一条' });
          if (first.version !== '0.1.0') throw new Error(`没按 package.json 取版本：${first.version}`);
          addChangelog(dir, { kind: 'fixed', note: '修了一条' });
          const text = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
          if (!text.includes('### 🐛 修复')) throw new Error('没补分类小节');
          if (!text.includes('- 第一条') || !text.includes('- 修了一条')) throw new Error('条目没都写进去');
          report(title, true);
        } catch (error) {
          report(title, false, error.message.slice(0, 200));
        }
      });
    },
  },
];
