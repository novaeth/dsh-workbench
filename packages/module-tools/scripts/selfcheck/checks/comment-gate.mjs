import { commentViolationsOf } from '../../../src/checks/source.mjs';

const TITLE = '模块源码零注释判据自己有正负例';

const CASES = [
  ['行注释', '// x\nexport const a = 1;\n', {}, 1],
  ['块注释', '/* x */\nexport const a = 1;\n', {}, 1],
  ['JSDoc', '/** x */\nexport const a = 1;\n', {}, 1],
  ['行尾注释', 'foo(); // x\nexport const a = 1;\n', {}, 1],
  ['字符串里的斜杠', 'const s = "// x";\nexport const a = 1;\n', {}, 0],
  ['正则里的斜杠', 'const r = /\\/\\//;\nexport const a = 1;\n', {}, 0],
  ['eslint 指令', '// eslint-disable-next-line\nexport const a = 1;\n', {}, 0],
  ['ts 指令', '// @ts-expect-error\nexport const a = 1;\n', {}, 0],
  ['PURE 指令', '/* @__PURE__ */\nexport const a = 1;\n', {}, 0],
  ['CSS 注释', '/* x */\nbody { color: red; }\n', { css: true }, 1],
];

export const checks = [
  {
    title: TITLE,
    run(_ctx, report) {
      const wrong = CASES.map(([why, text, options, want]) => ({
        why,
        got: commentViolationsOf(text, options).length,
        want,
      })).filter((one) => one.got !== one.want);
      report(
        TITLE,
        wrong.length === 0,
        wrong.length === 0
          ? `${String(CASES.length)} 条正负例都对`
          : wrong.map((one) => `${one.why}：期望 ${String(one.want)} 处、判成 ${String(one.got)} 处`).join('；'),
      );
    },
  },
];
