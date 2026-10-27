import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { CHECKS } from '../../../src/check.mjs';
import { BIN, REPO_ROOT, linkToolchain, read } from '../lib.mjs';

function runCheck(probe, workshop, only) {
  try {
    const out = execFileSync(process.execPath, [BIN, 'check', '--only', only], {
      cwd: probe,
      env: { ...process.env, DSH_WB_ROOT: workshop },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { failed: false, out: String(out) };
  } catch (error) {
    return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

function initTemplate(workshop, unit, template) {
  const dir = join(workshop, 'packages', `module-${unit}`);
  execFileSync(process.execPath, [BIN, 'init', unit, '--dir', dir, '--template', template], { stdio: 'pipe' });
  return dir;
}

function hashTree(dir) {
  const hash = createHash('sha256');
  const walk = (at) => {
    const entries = readdirSync(at, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      if (entry.name === 'node_modules') continue;
      const full = join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else hash.update(`${relative(dir, full)}\n${readFileSync(full)}`);
    }
  };
  walk(dir);
  return hash.digest('hex');
}

const NOISY = 'export function noisy(): void {\n  console.log("debug");\n}\n';
const LOOSE = 'export function loose(value: unknown): string {\n  return value as any;\n}\n';
const CONDITIONAL_HOOK =
  "import { useState } from 'react';\n\nexport function Cond({ on }: { on: boolean }) {\n" +
  '  if (!on) return null;\n  const [count] = useState(0);\n  return <span>{count}</span>;\n}\n';
const COLOR = "export const tone = '#ff0000';\n";
const IMPORTANT = "export const override = 'color: red !important';\n";
const PLATFORM = 'export const host = process.platform;\n';
const VENDOR =
  'export function Vendor() {\n' +
  "  const style = { color: '#ff0000', background: 'red !important' };\n" +
  '  return style;\n}\n';
const IMPURE = 'export function Random() {\n  return <div>{Math.random()}</div>;\n}\n';

const CONFIG_IMPORT = "import { moduleLint } from '@dsh-workbench/module-tools/lint';\n";
const DIALECT_CONFIGS = {
  bare: `${CONFIG_IMPORT}export default moduleLint();\n`,
  root: `${CONFIG_IMPORT}export default moduleLint({ rootDir: import.meta.dirname });\n`,
  rulesOnly: `${CONFIG_IMPORT}export default moduleLint({ rules: { 'no-console': 'off' } });\n`,
  ignores: `${CONFIG_IMPORT}export default moduleLint({ ignores: ['src/legacy/**'] });\n`,
  append:
    `${CONFIG_IMPORT}export default [\n` +
    '  ...moduleLint(),\n' +
    "  { files: ['src/legacy/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },\n" +
    '];\n',
  rulesAndExtra:
    `${CONFIG_IMPORT}export default [\n` +
    "  ...moduleLint({ rules: { 'no-console': 'off' } }),\n" +
    "  { files: ['src/legacy/**'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },\n" +
    '];\n',
  empty: 'export default [];\n',
  nameOnly: "export default [{ name: 'dsh-wb/module-lint', rules: {} }];\n",
  keepNamed: `${CONFIG_IMPORT}export default moduleLint().filter((block) => block.name !== undefined);\n`,
  noJsRecommended:
    `${CONFIG_IMPORT}export default moduleLint().filter(` + "(block) => block.name !== '@eslint/js/recommended');\n",
  noTsBase:
    `${CONFIG_IMPORT}export default moduleLint().filter(` +
    "(block) => block.name !== 'typescript-eslint/base');\n",
  noDtsIgnore:
    `${CONFIG_IMPORT}export default moduleLint().map((block) =>\n` +
    '  Array.isArray(block.ignores)\n' +
    "    ? { ...block, ignores: block.ignores.filter((glob) => glob !== '**/*.d.ts') }\n" +
    '    : block,\n' +
    ');\n',
  noHooks:
    `${CONFIG_IMPORT}export default moduleLint().filter(` +
    "(block) => block.name !== 'dsh-wb/module-lint/react-hooks');\n",
  noConsole:
    `${CONFIG_IMPORT}export default moduleLint().map((block) => {\n` +
    "  if (block.name !== 'dsh-wb/module-lint') return block;\n" +
    '  const rules = { ...block.rules };\n' +
    "  delete rules['no-console'];\n" +
    '  return { ...block, rules };\n' +
    '});\n',
  duplicate:
    `${CONFIG_IMPORT}export default [\n` +
    '  ...moduleLint(),\n' +
    "  { name: 'dsh-wb/module-lint', files: ['src/**/*.{ts,tsx}'], rules: {} },\n" +
    '];\n',
};

export const checks = [
  {
    title:
      '第十三条判据（lint）：两个模板开箱 ✔；console / as any / 条件 hook / 颜色字面量 / !important 逐条点名规则；vendor 仍绿；'
      + '方言逐块比整份（基础块 + 四块 dsh-wb/module-lint*，全局 ignores 按超集：只抄名字 / 筛掉基础块 / 少一条 ignores 都红）；'
      + '手写空配置与跑不起来的配置判红；拿走配置是「不适用」；只有 warn 不判红；跑完文件一个字节没变',
    run(ctx, report) {
      const workshop = mkdtempSync(join(tmpdir(), 'dsh-wb-lint-'));
      try {
        const diyDir = initTemplate(workshop, 'diy', 'diy');
        const minimalDir = initTemplate(workshop, 'minimal', 'minimal');
        linkToolchain(ctx.toolchain, join(diyDir, 'node_modules'));
        linkToolchain(ctx.toolchain, join(minimalDir, 'node_modules'));

        const configPath = join(diyDir, 'eslint.config.mjs');
        const minimalConfigPath = join(minimalDir, 'eslint.config.mjs');
        const diyConfig = readFileSync(configPath, 'utf8');
        const minimalConfig = readFileSync(minimalConfigPath, 'utf8');

        const expectGreen = (what, needles = []) => {
          const result = runCheck(diyDir, workshop, 'lint');
          if (result.failed) throw new Error(`${what}：该绿却红了\n${result.out}`);
          if (!result.out.includes('✔ 模块代码卫生')) throw new Error(`${what}：没有 ✔ 那一行\n${result.out}`);
          for (const needle of needles) {
            if (!result.out.includes(needle)) throw new Error(`${what}：绿了但没说清「${needle}」\n${result.out}`);
          }
        };
        const expectRed = (what, needs) => {
          const result = runCheck(diyDir, workshop, 'lint');
          if (!result.failed) throw new Error(`${what}：该红却绿了\n${result.out}`);
          for (const need of needs) {
            const said = need instanceof RegExp ? need.test(result.out) : result.out.includes(need);
            if (!said) throw new Error(`${what}：判红了但没说清「${String(need)}」\n${result.out}`);
          }
        };
        const write = (file, text) => writeFileSync(join(diyDir, file), text);
        const drop = (file) => rmSync(join(diyDir, file), { force: true });

        expectGreen('两个模板开箱', ['2/2 个模块包带 eslint.config.mjs', '0 error']);

        write('src/model/noisy.ts', NOISY);
        expectRed('src 里的 console.log', [/src\/model\/noisy\.ts:2:\d+ no-console/, 'no-console']);
        drop('src/model/noisy.ts');

        write('src/model/loose.ts', LOOSE);
        expectRed('as any', ['@typescript-eslint/no-explicit-any']);
        drop('src/model/loose.ts');

        write('src/components/Cond.tsx', CONDITIONAL_HOOK);
        expectRed('条件 useState', ['react-hooks/rules-of-hooks']);
        drop('src/components/Cond.tsx');

        write('src/components/Color.ts', COLOR);
        expectRed('颜色字面量', ['no-restricted-syntax', '颜色字面量']);
        drop('src/components/Color.ts');

        write('src/components/Important.ts', IMPORTANT);
        expectRed('字符串里的 !important', ['no-restricted-syntax', '!important']);
        drop('src/components/Important.ts');

        write('src/components/Platform.ts', PLATFORM);
        expectRed('模块直接读 process.platform', ['no-restricted-syntax', 'process.platform']);
        drop('src/components/Platform.ts');

        mkdirSync(join(diyDir, 'src', 'components', 'vendor'), { recursive: true });
        write('src/components/vendor/V.tsx', VENDOR);
        expectGreen('vendor 里的 !important 与颜色字面量', ['0 error']);
        drop('src/components/vendor/V.tsx');

        write('src/components/Impure.tsx', IMPURE);
        expectGreen('只有 warn 的命中', ['0 error', 'react-hooks/purity', '不挡门禁']);
        drop('src/components/Impure.tsx');

        write('src/model/red.ts', `${NOISY}${COLOR}`);
        const before = hashTree(diyDir);
        expectRed('只看不写（先造红）', ['no-console']);
        const after = hashTree(diyDir);
        if (before !== after) throw new Error('`check --only lint` 动了文件：跑前跑后内容哈希不一致（判据不许写）');
        drop('src/model/red.ts');

        const dialectCases = [
          { what: '裸 moduleLint()', text: DIALECT_CONFIGS.bare },
          { what: 'moduleLint({ rootDir })', text: DIALECT_CONFIGS.root },
          { what: 'moduleLint({ rules })', text: DIALECT_CONFIGS.rulesOnly },
          { what: 'moduleLint({ ignores }) 多忽略一条', text: DIALECT_CONFIGS.ignores },
          { what: '展开 moduleLint() 再追加一块', text: DIALECT_CONFIGS.append },
          { what: '带 rules 再追加一块', text: DIALECT_CONFIGS.rulesAndExtra },
          {
            what: '手写的空配置',
            text: DIALECT_CONFIGS.empty,
            needs: ['不是 moduleLint() 来的', 'moduleLint'],
          },
          {
            what: '只抄一个同名的空块',
            text: DIALECT_CONFIGS.nameOnly,
            needs: ['不一致', '改了「dsh-wb/module-lint」那一块的 files', '少了「dsh-wb/module-lint/react-hooks」那一块'],
          },
          {
            what: '只留带名字的块（filter 掉全局 ignores）',
            text: DIALECT_CONFIGS.keepNamed,
            needs: ['与 moduleLint() 产出的不一致', '少了全局 ignores', '缺 **/node_modules/**'],
          },
          {
            what: '筛掉 @eslint/js/recommended',
            text: DIALECT_CONFIGS.noJsRecommended,
            needs: ['少了「@eslint/js/recommended」那一块'],
          },
          {
            what: '筛掉 typescript-eslint/base',
            text: DIALECT_CONFIGS.noTsBase,
            needs: ['少了「typescript-eslint/base」那一块'],
          },
          {
            what: '全局 ignores 少一条 **/*.d.ts',
            text: DIALECT_CONFIGS.noDtsIgnore,
            needs: ['少了全局 ignores（缺 **/*.d.ts）'],
          },
          {
            what: 'filter 掉 react-hooks 那一块',
            text: DIALECT_CONFIGS.noHooks,
            needs: ['少了「dsh-wb/module-lint/react-hooks」那一块', 'overrides'],
          },
          {
            what: '把主块的 no-console 删掉',
            text: DIALECT_CONFIGS.noConsole,
            needs: ['改了「dsh-wb/module-lint」那一块的 rules', '少了 no-console'],
          },
          {
            what: '同名主块来两份（后一份掏空）',
            text: DIALECT_CONFIGS.duplicate,
            needs: ['「dsh-wb/module-lint」出现了 2 次'],
          },
        ];
        for (const one of dialectCases) {
          writeFileSync(configPath, one.text);
          if (one.needs === undefined) expectGreen(`方言：${one.what}`);
          else expectRed(`方言：${one.what}`, one.needs);
        }
        writeFileSync(configPath, diyConfig);

        writeFileSync(configPath, 'export default [\n');
        expectRed('跑不起来的配置', ['eslint.config.mjs 跑不起来']);
        writeFileSync(configPath, diyConfig);

        rmSync(configPath, { force: true });
        rmSync(minimalConfigPath, { force: true });
        const skipped = runCheck(diyDir, workshop, 'lint');
        if (skipped.failed) throw new Error(`没有配置的模块不该红：\n${skipped.out}`);
        for (const needle of ['○ 模块代码卫生', '不适用', 'eslint.config.mjs', 'moduleLint']) {
          if (!skipped.out.includes(needle)) {
            throw new Error(`没有配置时那句「怎么上车」没说出来（缺「${needle}」）：\n${skipped.out}`);
          }
        }
        writeFileSync(configPath, diyConfig);
        writeFileSync(minimalConfigPath, minimalConfig);

        report(
          '第十三条判据（lint）的正负例都对',
          true,
          '正例 9（两个模板开箱 / vendor / 只有 warn / 裸方言 / 带 rootDir / 带 rules / 多忽略一条 / 展开再追加 / 带 rules 再追加）'
            + '+ 负例 15（console / any / 条件 hook / 颜色 / !important / 平台原始事实 / 空配置 / 只抄名字 / 只留带名字的块 / 筛掉 js recommended / '
            + '筛掉 ts base / ignores 少一条 / 少 react-hooks / 改规则 / 同名两块）'
            + '+ 只看不写（内容哈希前后一致）+ 拿走配置的「不适用」+ 配置跑不起来的人话',
        );
      } finally {
        rmSync(workshop, { recursive: true, force: true });
      }
    },
  },
  {

    title:
      '结构棘轮：CHECKS 里每个判据名在仓库根 package.json 里都有一条 check:<名> 脚本（加第十四条判据时先被它咬到）',
    run(_ctx, report) {
      const scripts = JSON.parse(read(join(REPO_ROOT, 'package.json'))).scripts ?? {};
      const names = Object.keys(CHECKS);
      const missing = names.filter((name) => typeof scripts[`check:${name}`] !== 'string');
      report(
        `结构棘轮：${names.length} 条判据在仓库根 package.json 里都有 check:<名> 脚本`,
        missing.length === 0,
        missing.length ? `缺：${missing.map((name) => `check:${name}`).join('、')}` : '',
      );
    },
  },
];
