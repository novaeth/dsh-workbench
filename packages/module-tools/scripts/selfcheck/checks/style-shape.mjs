import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BIN, PACKAGES_DIR, FACES, declaration } from '../lib.mjs';

export const checks = [
  {
    title: '表单的行距：`.demoField { gap }` → 红（点名那一行）；`.demoCard { gap }` → 绿（卡片布局放行）',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.formgap-'));
      const css = join(probe, 'src/Panel.module.css');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      const problems = [];
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-formgap',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-formgap'),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(join(probe, 'src', 'client.tsx'), 'export const box = () => null;\n');
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

        writeFileSync(css, '.demoField {\n  display: flex;\n  gap: var(--wb-len-8);\n}\n');
        const bad = run();
        if (!bad.failed) problems.push('模块自己给 field 容器写 gap 居然没红');
        else if (!bad.out.includes('模块自己管了行距')) problems.push(`红是红了，但没点明原因是行距：${tail(bad.out)}`);
        else if (!bad.out.includes('Panel.module.css:3')) {
          problems.push(`没点名到那一行（应该是 Panel.module.css:3）：${tail(bad.out)}`);
        }

        writeFileSync(css, '.demoCard {\n  display: flex;\n  gap: var(--wb-len-8);\n}\n');
        const good = run();
        if (good.failed) problems.push(`卡片类名上的 gap 被误报了：${tail(good.out)}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        '表单的行距：`.demoField { gap }` → 红（点名那一行）；`.demoCard { gap }` → 绿（卡片布局放行）',
        problems.length === 0,
        problems.join(' · '),
      );
    },
  },
  {
    title: '操作区：借 `wb-formActions` 手摆按钮 → 红（点名那一行）；换成 <FormActions actions={…} /> → 绿',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.actionarea-'));
      const client = join(probe, 'src/client.tsx');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      const problems = [];
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-actionarea',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-actionarea'),
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
          'export const bar = () => (\n' +
            '  <div className="wb-formActions">\n' +
            "    <Button onClick={onRetry}>{t('demo.retry')}</Button>\n" +
            "    <Button variant=\"primary\" onClick={onSave}>{t('demo.save')}</Button>\n" +
            '  </div>\n' +
            ');\n',
        );
        const bad = run();
        if (!bad.failed) problems.push('借 wb-formActions 手摆按钮居然没红');
        else if (!bad.out.includes('手写了操作区')) problems.push(`红是红了，但没点明原因是手写的操作区：${tail(bad.out)}`);
        else if (!bad.out.includes('client.tsx:2')) {
          problems.push(`没点名到那一行（应该是 client.tsx:2）：${tail(bad.out)}`);
        }

        writeFileSync(
          client,
          'export const bar = () => (\n' +
            '  <FormActions\n' +
            '    actions={[\n' +
            "      { key: 'retry', label: t('demo.retry'), onClick: onRetry },\n" +
            "      { key: 'save', label: t('demo.save'), kind: 'primary', onClick: onSave },\n" +
            '    ]}\n' +
            '  />\n' +
            ');\n',
        );
        const good = run();
        if (good.failed) problems.push(`换成 kit 的 FormActions 之后还是红的：${tail(good.out)}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        '操作区：借 `wb-formActions` 手摆按钮 → 红（点名那一行）；换成 <FormActions actions={…} /> → 绿',
        problems.length === 0,
        problems.join(' · '),
      );
    },
  },
  {
    title: '字号口径：刻度外字面值 → 仍是绿，note 点名文件:行与那一句声明；刻度上的那处归另一档',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.fontscale-'));
      const css = join(probe, 'src/Panel.module.css');
      const tail = (out) => out.trim().split('\n').slice(-5).join(' | ');
      const problems = [];
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-fontscale',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-fontscale'),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(css, '.hero {\n  font-size: 28px;\n}\n\n.note {\n  font-size: 13px;\n}\n');
        let out;
        try {
          out = String(
            execFileSync(process.execPath, [BIN, 'check', '--only', 'style'], {
              cwd: probe,
              encoding: 'utf8',
              stdio: 'pipe',
            }),
          );
        } catch (error) {

          report(
            '字号口径：刻度外字面值 → 仍是绿，note 点名文件:行与那一句声明；刻度上的那处归另一档',
            false,
            `刻度外字面值把判据判红了 —— 这一条该是黄（note），不该新增不过项：${tail(
              `${error.stdout ?? ''}${error.stderr ?? ''}`,
            )}`,
          );
          return;
        }
        if (!/刻度外字面值 \d+ 处 \/ \d+ 文件/.test(out) || !/刻度上字面值 \d+ 处/.test(out)) {
          problems.push(`note 里没有"各类条数 + 涉及文件数"的汇总：${tail(out)}`);
        }
        if (!out.includes('@dsh-workbench/module-demo-fontscale: src/Panel.module.css:2')) {
          problems.push(`note 没点名到那一处刻度外字面值（Panel.module.css:2）：${tail(out)}`);
        }
        if (!out.includes('font-size: 28px') || !out.includes('28 不在刻度上')) {
          problems.push(`note 没把 28px 与刻度对不上这件事说出来：${tail(out)}`);
        }
        if (!out.includes('src/Panel.module.css:6') || !out.includes('13 在刻度上')) {
          problems.push(`刻度上的那处（13px）没归到"刻度上"那一档：${tail(out)}`);
        }
        report(
          '字号口径：刻度外字面值 → 仍是绿，note 点名文件:行与那一句声明；刻度上的那处归另一档',
          problems.length === 0,
          problems.join(' · '),
        );
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
  {
    title: '表单的面：手写裸 `<form>` → 红（点名那一行）；换成 kit 的 <Form fields={…} /> → 绿',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.form-face-'));
      const client = join(probe, 'src/client.tsx');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      const problems = [];
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-form-face',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-form-face'),
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
          'export const panel = () => (\n' +
            '  <form onSubmit={save}>\n' +
            "    <FormRow label={t('demo.name')}>\n" +
            '      <TextField value={name} onChange={setName} />\n' +
            '    </FormRow>\n' +
            '    <FormActions actions={actions} />\n' +
            '  </form>\n' +
            ');\n',
        );
        const bad = run();
        if (!bad.failed) problems.push('手写裸 <form> 居然没红');
        else if (!bad.out.includes('手写了裸 <form>')) problems.push(`红是红了，但没点明原因是手写的表单面：${tail(bad.out)}`);
        else if (!bad.out.includes('client.tsx:2')) {
          problems.push(`没点名到那一行（应该是 client.tsx:2）：${tail(bad.out)}`);
        } else if (!bad.out.includes('改用 kit 的 Form')) {
          problems.push(`没给"改用 kit 的 Form"那句：${tail(bad.out)}`);
        }

        writeFileSync(
          client,
          'export const panel = () => (\n' +
            '  <Form\n' +
            '    fields={[\n' +
            "      { key: 'name', label: t('demo.name'), value: name, control: (binding) => <TextField {...binding} /> },\n" +
            '    ]}\n' +
            '    onSubmit={save}\n' +
            "    submit={{ label: t('demo.save') }}\n" +
            '  />\n' +
            ');\n',
        );
        const good = run();
        if (good.failed) problems.push(`换成 kit 的 Form 之后还是红的：${tail(good.out)}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        '表单的面：手写裸 `<form>` → 红（点名那一行）；换成 kit 的 <Form fields={…} /> → 绿',
        problems.length === 0,
        problems.join(' · '),
      );
    },
  },
  {
    title: '表单的行：借 `wb-formRows` / `wb-formRow` / `wb-field` 槽类手摆 → 红（三行各点各的名）；换成 <Form fields={…} /> → 绿',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.form-rows-'));
      const client = join(probe, 'src/client.tsx');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      const problems = [];
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-form-rows',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-form-rows'),
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
          'export const rows = () => (\n' +
            '  <div className="wb-formRows">\n' +
            '    <div className="wb-formRow">\n' +
            '      <span className="wb-field">名称</span>\n' +
            '    </div>\n' +
            '  </div>\n' +
            ');\n',
        );
        const bad = run();
        if (!bad.failed) problems.push('借 wb-formRow / wb-formRows / wb-field 手摆行居然没红');
        else if (!bad.out.includes('手写了表单的行')) problems.push(`红是红了，但没点明原因是手写的行：${tail(bad.out)}`);
        else {
          for (const line of [2, 3, 4]) {
            if (!bad.out.includes(`client.tsx:${line}`)) {
              problems.push(`没点名到第 ${line} 行：${tail(bad.out)}`);
            }
          }
        }

        writeFileSync(
          client,
          'export const rows = () => (\n' +
            '  <Form\n' +
            '    fields={[\n' +
            "      { key: 'name', label: t('demo.name'), value: name, control: (binding) => <TextField {...binding} /> },\n" +
            '    ]}\n' +
            '    onSubmit={save}\n' +
            "    submit={{ label: t('demo.save') }}\n" +
            '  />\n' +
            ');\n',
        );
        const good = run();
        if (good.failed) problems.push(`换成 kit 的 Form 之后还是红的：${tail(good.out)}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        '表单的行：借 `wb-formRows` / `wb-formRow` / `wb-field` 槽类手摆 → 红（三行各点各的名）；换成 <Form fields={…} /> → 绿',
        problems.length === 0,
        problems.join(' · '),
      );
    },
  },
  {
    title: '表单面的窄口径：兄弟类 `wb-fieldLabel` / `wb-formLabel`… 与测试文件里的 `<form>` → 绿（只钉那三个槽类与裸 <form>）',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.form-narrow-'));
      const client = join(probe, 'src/client.tsx');
      const test = join(probe, 'src/__tests__/client.test.tsx');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      const problems = [];
      try {
        mkdirSync(join(probe, 'src/__tests__'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-form-narrow',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-form-narrow'),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(
          client,
          'export const slots = () => (\n' +
            '  <span className="wb-fieldLabel wb-fieldHint wb-formLabel wb-formHint">名称</span>\n' +
            ');\n',
        );
        writeFileSync(test, 'export const t = () => <form onSubmit={save} />;\n');
        let out;
        try {
          out = String(
            execFileSync(process.execPath, [BIN, 'check', '--only', 'style'], {
              cwd: probe,
              encoding: 'utf8',
              stdio: 'pipe',
            }),
          );
        } catch (error) {
          report(
            '表单面的窄口径：兄弟类 `wb-fieldLabel` / `wb-formLabel`… 与测试文件里的 `<form>` → 绿（只钉那三个槽类与裸 <form>）',
            false,
            `兄弟类或测试文件被误报了 —— 这一条该是绿：${tail(`${error.stdout ?? ''}${error.stderr ?? ''}`)}`,
          );
          return;
        }
        if (out.includes('手写了表单的行') || out.includes('手写了裸 <form>')) {
          problems.push(`绿是绿的，但表单那一族的红文案出现了（不该）：${tail(out)}`);
        }
        report(
          '表单面的窄口径：兄弟类 `wb-fieldLabel` / `wb-formLabel`… 与测试文件里的 `<form>` → 绿（只钉那三个槽类与裸 <form>）',
          problems.length === 0,
          problems.join(' · '),
        );
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
  {
    title: '槽类与裸元素的**两端边界**：`data-wb-field="x"` / `xwb-field` / `my-wb-formRows` / `<abbr>` / `x<a ` → 绿；`className="wb-field"` → 仍红',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.boundary-'));
      const client = join(probe, 'src/client.tsx');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      const problems = [];
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-boundary',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-boundary'),
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
          'export const panel = () => (\n' +
            '  <div data-wb-field="x" className={cx(\'xwb-field\', \'my-wb-formRows\')}>\n' +
            '    <abbr title="x" />\n' +
            '  </div>\n' +
            ');\n' +
            '\n' +
            'export function pick(count, a) {\n' +
            '  if (count<a ) return 1;\n' +
            '  return 0;\n' +
            '}\n',
        );
        const negatives = run();
        if (negatives.failed) {
          problems.push(`粘在前缀上的名字 / <abbr> / 比较运算被误报了 —— 边界没收干净：${tail(negatives.out)}`);
        }

        writeFileSync(
          client,
          'export const rows = () => (\n' +
            '  <div className="wb-formRows">\n' +
            '    <div className="wb-formRow">\n' +
            '      <span className="wb-field">名称</span>\n' +
            '    </div>\n' +
            '  </div>\n' +
            ');\n',
        );
        const positives = run();
        if (!positives.failed) problems.push('真槽类（wb-formRows / wb-formRow / wb-field）居然不红了 —— 边界收过头了');
        else {
          for (const line of [2, 3, 4]) {
            if (!positives.out.includes(`client.tsx:${line}`)) {
              problems.push(`真槽类没点名到第 ${line} 行：${tail(positives.out)}`);
            }
          }

          if (!positives.out.includes('槽类 wb-field')) {
            problems.push(`报错话里那个类名不干净（应逐字是 wb-field）：${tail(positives.out)}`);
          }
        }
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        '槽类与裸元素的**两端边界**：`data-wb-field="x"` / `xwb-field` / `my-wb-formRows` / `<abbr>` / `x<a ` → 绿；`className="wb-field"` → 仍红',
        problems.length === 0,
        problems.join(' · '),
      );
    },
  },
  {
    title: '外链：`<a` 写在**行尾**（属性在下一行）→ 红并点名那一行（逐行匹配漏掉的就是这一类）；写成 `Link` → 绿',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.anchor-'));
      const client = join(probe, 'src/client.tsx');
      const test = join(probe, 'src/__tests__/client.test.tsx');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      const problems = [];
      try {
        mkdirSync(join(probe, 'src/__tests__'), { recursive: true });
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
                workbench: declaration('demo-anchor'),
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
          'export const go = () => (\n' +
            '  <a\n' +
            '    href={url}\n' +
            '    target="_blank"\n' +
            '    rel="noreferrer noopener"\n' +
            '  >\n' +
            "    {t('demo.go')}\n" +
            '  </a>\n' +
            ');\n',
        );
        const eol = run();
        if (!eol.failed) problems.push('`<a` 写在行尾居然没红 —— 逐行匹配那个洞回来了');
        else if (!eol.out.includes('手写了裸 <a>')) problems.push(`红是红了，但没点明原因是手写的裸 <a>：${tail(eol.out)}`);
        else if (!eol.out.includes('client.tsx:2')) {
          problems.push(`没点名到那一行（应该是 client.tsx:2，也就是 <a 自己那一行）：${tail(eol.out)}`);
        }

        writeFileSync(
          client,
          'export const go = () => (\n' +
            '  <a href={url} target="_blank" rel="noreferrer noopener">{t(\'demo.go\')}</a>\n' +
            ');\n',
        );
        const inline = run();
        if (!inline.failed) problems.push('`<a ` 写在同一行居然没红');
        else if (!inline.out.includes('client.tsx:2')) problems.push(`同一行那处没点名到第 2 行：${tail(inline.out)}`);

        writeFileSync(
          client,
          'export const go = () => (\n' +
            "  <Link href={url}>{t('demo.go')}</Link>\n" +
            ');\n',
        );
        const good = run();
        if (good.failed) problems.push(`换成 kit 的 Link 之后还是红的：${tail(good.out)}`);

        writeFileSync(client, 'export const box = () => null;\n');
        writeFileSync(test, 'export const t = () => <a href={url}>{url}</a>;\n');
        const inTest = run();
        if (inTest.failed) problems.push(`测试文件里的裸 <a> 被误报了（射程守卫该把它挡在外面）：${tail(inTest.out)}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        '外链：`<a` 写在**行尾**（属性在下一行）→ 红并点名那一行（逐行匹配漏掉的就是这一类）；写成 `Link` → 绿',
        problems.length === 0,
        problems.join(' · '),
      );
    },
  },
  {
    title: '外链的豁免那一半：`ANCHOR_EXEMPT` 里登记过的文件 → 绿（图标链 / 按钮皮的链 / 整行链那三类不判；棘轮：包不在眼前就不说过期）',
    run(ctx, report) {

      const probe = mkdtempSync(join(PACKAGES_DIR, '.anchor-exempt-'));
      const file = join(probe, 'src/components/IssueRow.tsx');
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      const problems = [];
      const manifest = (name) =>
        JSON.stringify(
          {
            name,
            version: '0.0.1',
            private: true,
            type: 'module',
            peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
            scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
            dsh: {
              bundle: { patch: './cordis.patch.yml' },
              client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
              workbench: declaration('demo-anchor-exempt'),
              workbenchFaces: FACES,
            },
          },
          null,
          2,
        );
      try {
        mkdirSync(join(probe, 'src/components'), { recursive: true });

        writeFileSync(
          file,
          'export const go = () => (\n' +
            '  <a\n' +
            '    href={url}\n' +
            '    target="_blank"\n' +
            '  >\n' +
            "    {t('demo.go')}\n" +
            '  </a>\n' +
            ');\n',
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

        writeFileSync(join(probe, 'package.json'), manifest('@dsh-workbench/module-demo-anchor-exempt'));
        const exempt = run();
        if (exempt.failed) {
          problems.push(`ANCHOR_EXEMPT 里登记过的文件还是红的（豁免没生效）：${tail(exempt.out)}`);
        } else if (exempt.out.includes('已经不命中')) {
          problems.push(`豁免生效了，但棘轮说那一行不再命中（命中集没记上）：${tail(exempt.out)}`);
        }

        writeFileSync(join(probe, 'package.json'), manifest('@dsh-workbench/module-demo-anchor-not-exempt'));
        const notExempt = run();
        if (!notExempt.failed) problems.push('换了不在 ANCHOR_EXEMPT 里的包名，同一份源码居然还是绿的');
        else if (!notExempt.out.includes('手写了裸 <a>')) problems.push(`红是红了，但不是因为裸 <a>：${tail(notExempt.out)}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(
        '外链的豁免那一半：`ANCHOR_EXEMPT` 里登记过的文件 → 绿（图标链 / 按钮皮的链 / 整行链那三类不判；棘轮：包不在眼前就不说过期）',
        problems.length === 0,
        problems.join(' · '),
      );
    },
  },
];
