import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyChangelog, changelogProblemOf, readChangelogText } from '../../../src/changelog.mjs';

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
    title: 'changelog：没记录时拦下；带 note 从骨架起记一版，check 认这一版',
    run(_ctx, report) {
      const title = 'changelog：没记录时拦下；带 note 从骨架起记一版，check 认这一版';
      withDir((dir) => {
        try {
          if (changelogProblemOf(dir, '0.1.0') === undefined) throw new Error('没文件时居然说通过');
          const applied = applyChangelog(dir, {
            version: '0.1.0',
            kind: 'added',
            note: '第一个版本',
            date: '2026-10-26',
          });
          if (applied?.action !== 'written') throw new Error('没写进去');
          if (changelogProblemOf(dir, '0.1.0') !== undefined) throw new Error('写了还不认');
          if (changelogProblemOf(dir, '0.2.0') === undefined) throw new Error('别的版本居然认了');
          const text = readChangelogText(dir);
          if (!text.startsWith('# 更新日志')) throw new Error('没从骨架起');
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
    title: 'changelog：这一版已有内容就是 kept（不追加、不改原文）；note 为空不写',
    run(_ctx, report) {
      const title = 'changelog：这一版已有内容就是 kept（不追加、不改原文）；note 为空不写';
      withDir((dir) => {
        try {
          if (applyChangelog(dir, { note: '' }) !== undefined) throw new Error('note 为空居然写了');
          const first = applyChangelog(dir, { note: '第一条' });
          if (first?.version !== '0.1.0') throw new Error(`没按 package.json 取版本：${first?.version}`);
          const again = applyChangelog(dir, { kind: 'fixed', note: '再记一条' });
          if (again?.action !== 'kept') throw new Error(`已有内容还写：${again?.action}`);
          const text = readChangelogText(dir);
          if (text.includes('再记一条')) throw new Error('kept 还是把新 note 写进去了');
          if (!text.includes('- 第一条')) throw new Error('把原来的条目弄丢了');
          report(title, true);
        } catch (error) {
          report(title, false, error.message.slice(0, 200));
        }
      });
    },
  },
];
