import { createRule } from '@arch-guard/core';

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?(?:\.tpl)?$/;
const TESTS_HOME = /(?:^|\/)__tests__\//;

export function misplacedTests(files) {
  return files.filter((rel) => TEST_FILE.test(rel) && !TESTS_HOME.test(rel));
}

export const testsLiveInFolders = createRule({
  id: 'S73',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '测试文件住在 __tests__ 目录里',
  hint: '测试与被测代码物理分开：挪进同目录的 __tests__/，相对路径的 import 各退一级。',
  run(ctx) {
    return misplacedTests(ctx.records.map((record) => record.rel)).map((rel) => ({
      rule: 'S73',
      file: rel,
      line: 1,
      text: `测试文件不在 __tests__ 目录里：${rel}`,
      hint: '挪进同目录的 __tests__/，相对路径的 import 各退一级。',
    }));
  },
});
