import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BIN, FACES, PACKAGES_DIR, declaration, read } from '../lib.mjs';

import { inlinedShellRules } from '../../../src/css-shell.mjs';

export const checks = [
  {
    title: '外链：手写裸 <a> → 红（点名文件行号）；换成 kit 的 Link → 绿',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.anchor-'));
      const client = join(probe, 'src/client.tsx');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-anchor',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: { unit: 'demo-anchor' },
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        const run = () => {
          try {
            const out = execFileSync(process.execPath, [BIN, 'check', '--only', 'style'], {
              cwd: probe,
              encoding: 'utf8',
              stdio: 'pipe',
            });
            return { failed: false, out: String(out) };
          } catch (error) {
            return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
          }
        };

        writeFileSync(client, "export const open = () => h('a', { href: 'https://x' }, '去看账单');\n");
        const bad = run();
        if (!bad.failed) return report('外链：手写裸 <a> → 红（点名文件行号）；换成 kit 的 Link → 绿', false, '手写裸 <a> 居然没红');
        if (!bad.out.includes('手写了裸 <a>')) {
          return report('外链：手写裸 <a> → 红（点名文件行号）；换成 kit 的 Link → 绿', false, `红是红了，但没点明原因是裸 <a>：${tail(bad.out)}`);
        }
        if (!bad.out.includes('client.tsx:1')) {
          return report('外链：手写裸 <a> → 红（点名文件行号）；换成 kit 的 Link → 绿', false, `没点名到文件行号：${tail(bad.out)}`);
        }

        writeFileSync(client, "export const open = () => h(Link, { href: 'https://x' }, '去看账单');\n");
        const good = run();
        if (good.failed) return report('外链：手写裸 <a> → 红（点名文件行号）；换成 kit 的 Link → 绿', false, `换成 kit 的 Link 之后还是红的：${tail(good.out)}`);
        report('外链：手写裸 <a> → 红（点名文件行号）；换成 kit 的 Link → 绿', true);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
  {
    title: '控件：手写裸 <button> → 红（点名文件行号）；<textarea> 与 input[type=hidden|file] → 绿',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.control-'));
      const client = join(probe, 'src/client.tsx');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-control',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: { unit: 'demo-control' },
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        const run = () => {
          try {
            const out = execFileSync(process.execPath, [BIN, 'check', '--only', 'style'], {
              cwd: probe,
              encoding: 'utf8',
              stdio: 'pipe',
            });
            return { failed: false, out: String(out) };
          } catch (error) {
            return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
          }
        };

        writeFileSync(
          client,
          "export const pick = () => h('button', { type: 'button', onClick: go }, '重试');\n",
        );
        const bad = run();
        if (!bad.failed) return report('控件：手写裸 <button> → 红（点名文件行号）；<textarea> 与 input[type=hidden|file] → 绿', false, '手写裸 <button> 居然没红');
        if (!bad.out.includes('手写了裸 <button>')) {
          return report('控件：手写裸 <button> → 红（点名文件行号）；<textarea> 与 input[type=hidden|file] → 绿', false, `红是红了，但没点明原因是裸按钮：${tail(bad.out)}`);
        }
        if (!bad.out.includes('client.tsx:1')) {
          return report('控件：手写裸 <button> → 红（点名文件行号）；<textarea> 与 input[type=hidden|file] → 绿', false, `没点名到文件行号：${tail(bad.out)}`);
        }

        writeFileSync(
          client,
          "export const note = () => h('textarea', { value, onChange: onInput });\n" +
            "export const hidden = () => h('input', { type: 'hidden', value: id });\n" +
            "export const file = () => h('input', { type: 'file', onChange: onPick });\n",
        );
        const good = run();
        if (good.failed) {
          return report('控件：手写裸 <button> → 红（点名文件行号）；<textarea> 与 input[type=hidden|file] → 绿', false, `多行输入与 hidden/file 那两种形态被误报了：${tail(good.out)}`);
        }
        report('控件：手写裸 <button> → 红（点名文件行号）；<textarea> 与 input[type=hidden|file] → 绿', true);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
  {
    title:
      'kit 的样式不进产物：从 shared 根入口取运行期值 → 产物 0 条外壳规则、判据绿；手喂一条 .wb-activityBlock → 红并点名；干净产物 → 绿',
    run(ctx, report) {
      const title =
        'kit 的样式不进产物：从 shared 根入口取运行期值 → 产物 0 条外壳规则、判据绿；手喂一条 .wb-activityBlock → 红并点名；干净产物 → 绿';

      const workshop = mkdtempSync(join(tmpdir(), 'dsh-wb-kitcss-'));
      const probe = join(workshop, 'packages', 'kitcss-module');
      const clientFile = join(probe, 'client.js');
      const run = (args) => {
        try {
          return {
            failed: false,
            out: String(
              execFileSync(process.execPath, [BIN, ...args], {
                cwd: probe,
                env: { ...process.env, DSH_WB_ROOT: workshop },
                encoding: 'utf8',
                stdio: 'pipe',
              }),
            ),
          };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const check = () => run(['check', '--only', 'bundles']);
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');

      const artifact = (css) =>
        `window.__ModuleLoader__.load({ id: "@dsh-workbench/module-demo-kitcss", factory: (require) => { var css = ${JSON.stringify(css)}; return {}; } });\n`;
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        mkdirSync(join(probe, 'node_modules', '@dsh-workbench'), { recursive: true });

        symlinkSync(join(PACKAGES_DIR, 'shared'), join(probe, 'node_modules', '@dsh-workbench', 'shared'), 'dir');
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-kitcss',
              version: '0.0.1',
              private: true,
              type: 'module',
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-kitcss'),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');

        writeFileSync(
          join(probe, 'src/client.tsx'),
          "import * as shared from '@dsh-workbench/shared';\n" +
            "export const card = () => shared.Rows({ children: 'x' });\n" +
            'export const everything = shared;\n',
        );

        const built = run(['build']);
        if (built.failed) {
          return report(title, false, `从 shared 根入口取运行期值的模块居然构建失败：${tail(built.out)}`);
        }
        const source = read(clientFile);
        if (!source.includes('wb-rows')) {
          return report(title, false, '产物里没有 shared 的组件代码（wb-rows）—— 这条断言会空跑，先看构建图');
        }
        const inlined = inlinedShellRules(source);
        if (inlined.length > 0) {
          return report(
            title,
            false,
            `kit 的 CSS 没拦住：产物里内联了 ${inlined.length} 条外壳规则（${inlined.slice(0, 3).join(' · ')}）`,
          );
        }
        const builtGreen = check();
        if (builtGreen.failed) {
          return report(title, false, `真造出来的产物被误报（外壳规则一条没有却判红）：${tail(builtGreen.out)}`);
        }

        writeFileSync(
          clientFile,
          artifact('._a1b2c3_row {\n  color: red;\n}\n.wb-activityBlock {\n  padding: 0;\n}\n'),
        );
        const bad = check();
        if (!bad.failed) return report(title, false, '产物里内联了 kit 的 CSS 规则，居然没红');
        if (!bad.out.includes('内联了 1 条外壳的 CSS 规则')) {
          return report(title, false, `红是红了，但没说清内联了几条：${tail(bad.out)}`);
        }
        if (!bad.out.includes('.wb-activityBlock')) {
          return report(title, false, `红是红了，但没点名那条规则（.wb-activityBlock）：${tail(bad.out)}`);
        }

        writeFileSync(clientFile, artifact('._a1b2c3_row {\n  color: red;\n}\n'));
        const good = check();
        if (good.failed) return report(title, false, `不含外壳规则的产物被误报了：${tail(good.out)}`);
        report(title, true);
      } finally {
        rmSync(workshop, { recursive: true, force: true });
      }
    },
  },
  {
    title: '表单的行：手写「标签 span + SelectField」→ 红（点名控件那一行）；换成 <FormRow> → 绿',
    run(ctx, report) {
      const title = '表单的行：手写「标签 span + SelectField」→ 红（点名控件那一行）；换成 <FormRow> → 绿';

      const probe = mkdtempSync(join(PACKAGES_DIR, '.formrow-'));
      const client = join(probe, 'src/client.tsx');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-formrow',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-formrow'),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        const run = () => {
          try {
            const out = execFileSync(process.execPath, [BIN, 'check', '--only', 'style'], {
              cwd: probe,
              encoding: 'utf8',
              stdio: 'pipe',
            });
            return { failed: false, out: String(out) };
          } catch (error) {
            return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
          }
        };

        writeFileSync(
          client,
          "export const pick = () => (\n" +
            "  <div className={styles.field}>\n" +
            "    <span className={styles.label}>{t('demo.field.name')}</span>\n" +
            '    <SelectField value={value} onChange={onPick} />\n' +
            '  </div>\n' +
            ');\n',
        );
        const bad = run();
        if (!bad.failed) return report(title, false, '手写的「标签 + 控件」行居然没红');
        if (!bad.out.includes('手写的「标签 + 控件」行')) {
          return report(title, false, `红是红了，但没点明原因是手写的行：${tail(bad.out)}`);
        }
        if (!bad.out.includes('client.tsx:4')) {
          return report(title, false, `没点名到控件那一行（应该是 client.tsx:4）：${tail(bad.out)}`);
        }

        writeFileSync(
          client,
          "export const pick = () => (\n" +
            "  <FormRow label={t('demo.field.name')}>\n" +
            '    <SelectField value={value} onChange={onPick} />\n' +
            '  </FormRow>\n' +
            ');\n',
        );
        const good = run();
        if (good.failed) return report(title, false, `换成 kit 的 FormRow 之后还是红的：${tail(good.out)}`);
        report(title, true);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
];
