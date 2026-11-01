import {
  declaredWritesOf,
  declaredWritesProblemsOf,
  rawSeamProblemsOf,
  writesUseProblemsOf,
} from '../../../src/checks/seam.mjs';

const TITLE = '模块执行缝判据自己有正负例';

const RAW_CASES = [
  ['import runShell', "import { runShell } from '@dsh-workbench/shared/host';\n", 1],
  ['调用 runShell', "runShell('ls');\n", 1],
  ['shellOf', 'const shell = shellOf(ctx);\n', 1],
  ["ctx.get('shell')", "const shell = ctx.get('shell');\n", 1],
  ["ctx.get('workbenchShell')", "const shell = ctx.get('workbenchShell');\n", 1],
  ["ctx.get('seam')", "const seam = ctx.get('seam');\n", 1],
  ['node:child_process', "import { execFileSync } from 'node:child_process';\n", 1],
  ['child_process', "const { execSync } = require('child_process');\n", 1],
  ['门面走 deps.seam', "const run = () => deps.seam.run({ scope: 'unit', command: 'echo hi' });\n", 0],
  ['普通字符串', "const text = 'shell';\n", 0],
];

const WRITES_CASES = [
  ['不写（缺省）', { inject: [] }, 0],
  ['两档都声明', { inject: [], writes: ['unit', 'workspace'] }, 0],
  ['只有 unit', { inject: [], writes: ['unit'] }, 0],
  ['写了产品域', { inject: [], writes: ['product'] }, 1],
  ['写了个字符串', { inject: [], writes: 'unit' }, 1],
];

const USE_CASES = [
  [
    '声明了 workspace 再用',
    { inject: [], writes: ['workspace'] },
    "deps.seam.run({ scope: 'workspace' });\n",
    0,
  ],
  ['没声明就用 workspace', { inject: [] }, "deps.seam.run({ scope: 'workspace' });\n", 1],
  ['没声明就用 unit', { inject: [] }, 'deps.seam.run({ scope: "unit" });\n', 1],
  ['没提门面的 scope 不算', { inject: [] }, "const options = { scope: 'workspace' };\n", 0],
];

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const wrong = [];
      for (const [why, text, want] of RAW_CASES) {
        const got = rawSeamProblemsOf('@t/demo', 'src/host.ts', text).length > 0 ? 1 : 0;
        if (got !== want) wrong.push(`原始入口「${why}」：期望 ${String(want)} 处、判成 ${String(got)} 处`);
      }
      for (const [why, host, want] of WRITES_CASES) {
        const got = declaredWritesProblemsOf('@t/demo', { host }).length > 0 ? 1 : 0;
        if (got !== want) wrong.push(`writes「${why}」：期望 ${String(want)} 处、判成 ${String(got)} 处`);
      }
      for (const [why, host, text, want] of USE_CASES) {
        const got =
          writesUseProblemsOf('@t/demo', 'src/host.ts', text, declaredWritesOf({ host })).length > 0 ? 1 : 0;
        if (got !== want) wrong.push(`用法「${why}」：期望 ${String(want)} 处、判成 ${String(got)} 处`);
      }
      report(
        TITLE,
        wrong.length === 0,
        wrong.length === 0
          ? `${String(RAW_CASES.length + WRITES_CASES.length + USE_CASES.length)} 条正负例都对`
          : wrong.join('；'),
      );
    },
  },
];
