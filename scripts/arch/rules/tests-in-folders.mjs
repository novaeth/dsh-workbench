import { createRule } from '@arch-guard/core';

export const testsLiveInFolders = createRule({
  id: 'S73',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '测试文件住在 __tests__ 目录里',
  hint: '测试与被测代码物理分开：挪进同目录的 __tests__/，相对路径的 import 各退一级。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      if (!/\.test\.(ts|tsx)$/.test(record.rel)) continue;
      if (record.rel.includes('__tests__/')) continue;
      findings.push({
        rule: 'S73',
        file: record.rel,
        line: 1,
        text: `测试文件不在 __tests__ 目录里：${record.rel}`,
        hint: '挪进同目录的 __tests__/，相对路径的 import 各退一级。',
      });
    }
    return findings;
  },
});
