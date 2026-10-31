import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BIN } from '../lib.mjs';

export const checks = [
  {
    title: '新判据的负例与正例都对（dsh 的包：客户端侧放行 / 宿主侧、内联、漏声明都判红；样式：:global 判红、自己的类放行、令牌名对现读清单校验）',
    run(_ctx, report) {

      const title =
        '新判据的负例与正例都对（dsh 的包：客户端侧放行 / 宿主侧、内联、漏声明都判红；样式：:global 判红、自己的类放行、令牌名对现读清单校验）';
      const workspace = mkdtempSync(join(tmpdir(), 'dsh-wb-neg-'));
      const negDir = join(workspace, 'packages', 'neg-module');
      const manifest = (external) =>
        JSON.stringify(
          {
            name: '@neg/module-neg',
            version: '0.0.1',
            dsh: {

              bundle: { patch: ['./nope-a.yml', './nope-b.yml'] },
              client: { platform: 'web', inject: ['@dsh-workbench/core'], external },
              workbench: { unit: 'neg' },
              workbenchFaces: { host: 'src/plugin.host.ts', client: 'src/plugin.client.ts' },
            },
          },
          null,
          2,
        );
      try {
        mkdirSync(join(negDir, 'src'), { recursive: true });
        mkdirSync(join(negDir, 'dist'), { recursive: true });
        writeFileSync(join(negDir, 'package.json'), manifest([]));
        writeFileSync(
          join(negDir, 'src/plugin.client.ts'),
          "import { Button } from '@deepseek-ai/dsh-client-ui-primitives';\nimport { shared } from './shared';\nexport const client = [Button, shared];\n",
        );
        writeFileSync(
          join(negDir, 'src/plugin.host.ts'),
          "import { Modal } from '@deepseek-ai/dsh-client-ui-primitives';\nimport { shared } from './shared';\nexport const host = [Modal, shared];\n",
        );
        writeFileSync(
          join(negDir, 'src/shared.ts'),
          "import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';\nexport const shared = StateDot;\n",
        );
        writeFileSync(
          join(negDir, 'src/not-seed.ts'),
          "import { x } from '@deepseek-ai/dsh-something-else';\nexport const extra = x;\n",
        );
        writeFileSync(join(negDir, 'dist/host.js'), '"@deepseek-ai/dsh-client-ui-primitives"\n');

        const run = (only) => {
          try {
            const out = execFileSync(process.execPath, [BIN, 'check', '--only', only], {
              cwd: negDir,
              env: { ...process.env, DSH_WB_ROOT: workspace },
              encoding: 'utf8',
              stdio: 'pipe',
            });
            return { failed: false, out: String(out) };
          } catch (error) {
            return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
          }
        };
        const expectRed = (only, needles) => {
          const result = run(only);
          if (!result.failed) throw new Error(`负例没被判红：check --only ${only}`);
          for (const needle of needles) {
            if (!result.out.includes(needle)) {
              throw new Error(`check --only ${only} 判红了，但没说清「${needle}」：\n${result.out}`);
            }
          }
        };

        expectRed('contracts', ['./nope-a.yml', './nope-b.yml']);
        expectRed('source', ['在宿主侧可达', '两个入口都到得了', '不是平台种子词']);
        expectRed('primitives', ['没声明它', '没有 client.js', '宿主产物 dist/host.js 里出现了']);

        writeFileSync(join(negDir, 'package.json'), manifest(['@deepseek-ai/dsh-client-ui-primitives']));
        writeFileSync(join(negDir, 'src/plugin.host.ts'), "import { shared } from './shared';\nexport const host = shared;\n");
        writeFileSync(join(negDir, 'src/shared.ts'), 'export const shared = 1;\n');
        rmSync(join(negDir, 'src/not-seed.ts'));
        writeFileSync(
          join(negDir, 'client.js'),
          'window.__ModuleLoader__.load({ id: "@neg/module-neg", factory: (require) => { require("@deepseek-ai/dsh-client-ui-primitives"); return {}; } });\n',
        );
        writeFileSync(join(negDir, 'dist/host.js'), 'export const host = 1;\n');
        for (const only of ['source', 'primitives']) {
          const result = run(only);
          if (result.failed) throw new Error(`修好之后还是红的（一刀切了）：check --only ${only}\n${result.out}`);
        }

        const expectGreen = (only, why) => {
          const result = run(only);
          if (result.failed) throw new Error(`${why} 被误报了：check --only ${only}\n${result.out}`);
        };
        const clientWidget = (widget) => {
          writeFileSync(join(negDir, 'src/widget.ts'), widget);
          writeFileSync(
            join(negDir, 'src/plugin.client.ts'),
            "import { shared } from './shared';\nimport { widget } from './widget';\nexport const client = [shared, widget];\n",
          );
          writeFileSync(
            join(negDir, 'src/plugin.host.ts'),
            "import { shared } from './shared';\nexport const host = shared;\n",
          );
        };
        clientWidget("import { factOfRoute } from '@dsh-workbench/shared';\nexport const widget = () => factOfRoute('neg/x');\n");
        expectRed('source', ['根入口是浏览器 barrel', '改从 kit']);
        clientWidget("import type { Translate } from '@dsh-workbench/shared';\nexport const widget = (t: Translate) => t;\n");
        expectGreen('source', '从根入口只取类型（import type）');
        clientWidget("import { type Translate } from '@dsh-workbench/shared';\nexport const widget = (t: Translate) => t;\n");
        expectGreen('source', '从根入口只取类型（逐个 type 修饰）');
        clientWidget(
          "import { PANEL_STATE_PATH } from '@dsh-workbench/shared/host';\nexport const widget = () => PANEL_STATE_PATH;\n",
        );
        expectRed('source', ['宿主入口里有 node:crypto', '客户端侧可达']);

        writeFileSync(join(negDir, 'src/widget.ts'), 'export const widget = 1;\n');
        writeFileSync(
          join(negDir, 'src/plugin.host.ts'),
          "import { PANEL_STATE_PATH } from '@dsh-workbench/shared/host';\nimport { shared } from './shared';\nexport const host = [shared, PANEL_STATE_PATH];\n",
        );
        expectGreen('source', '宿主侧从 /host 取运行值');
        writeFileSync(
          join(negDir, 'src/plugin.host.ts'),
          "import { relativeTime } from '@dsh-workbench/shared';\nimport { shared } from './shared';\nexport const host = [shared, relativeTime(0)];\n",
        );
        expectRed('source', ['根入口是浏览器 barrel', '改从 @dsh-workbench/shared/host']);

        writeFileSync(
          join(negDir, 'src/spawn.ts'),
          "import { spawn } from 'node:child_process';\nexport const spawnOne = spawn;\n",
        );
        expectRed('source', ['process-spawn', 'src/spawn.ts']);
        rmSync(join(negDir, 'src/spawn.ts'), { force: true });
        writeFileSync(join(negDir, 'src/plugin.host.ts'), "import { shared } from './shared';\nexport const host = shared;\n");
        expectGreen('source', '还原之后');

        writeFileSync(join(negDir, 'src/scope.module.css'), ':global(.wb-cardBody) {\n  padding: 0;\n}\n');
        expectRed('style', ['定义了外壳类的 CSS 规则', ':global(.wb-cardBody)']);
        writeFileSync(join(negDir, 'src/scope.module.css'), '.row:global(.wb-cardBody) {\n  padding: 0;\n}\n');
        const styleGreen = run('style');
        if (styleGreen.failed) {
          throw new Error(`合规的「自己的节点 + 外壳的槽类」被误报了：check --only style\n${styleGreen.out}`);
        }

        const fakeCore = join(negDir, 'node_modules', '@dsh-workbench', 'core');
        mkdirSync(fakeCore, { recursive: true });
        writeFileSync(join(fakeCore, 'package.json'), JSON.stringify({ name: '@dsh-workbench/core', version: '0.0.0-probe' }));
        writeFileSync(join(fakeCore, 'client.js'), 'const css = ":root{--wb-len-16:16px}";\n');
        writeFileSync(join(negDir, 'src/token.module.css'), '.row {\n  gap: var(--wb-len-16);\n  padding: var(--wb-nope-1);\n}\n');
        expectRed('style', ['令牌清单里没有它', '--wb-nope-1']);
        writeFileSync(join(negDir, 'src/token.module.css'), '.row {\n  gap: var(--wb-len-16);\n}\n');
        expectGreen('style', '合规的令牌名（--wb-* 对现读清单）');

        const loader = (css) =>
          `window.__ModuleLoader__.load({ id: "@neg/module-neg", factory: (require) => { var css = ${JSON.stringify(css)}; return {}; } });\n`;
        writeFileSync(
          join(negDir, 'client.js'),
          loader('._a1b2c3_row {\n  color: red;\n}\n.wb-cardBody {\n  padding: 12px;\n}\n'),
        );
        expectRed('bundles', ['内联了 1 条外壳的 CSS 规则', '.wb-cardBody']);
        writeFileSync(join(negDir, 'client.js'), loader('._a1b2c3_row.wb-cardBody {\n  padding: 0;\n}\n'));
        const bundlesGreen = run('bundles');
        if (bundlesGreen.failed) {
          throw new Error(`合规的「自己的类 + 外壳的槽类」被误报了：check --only bundles\n${bundlesGreen.out}`);
        }
        report(title, true);
      } catch (error) {
        report(title, false, `判据负例坏了：${error.message}`);
      } finally {
        rmSync(workspace, { recursive: true, force: true });
      }
    },
  },
];
