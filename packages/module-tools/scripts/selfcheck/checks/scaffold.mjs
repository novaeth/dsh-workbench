import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { CHECKS } from '../../../src/check.mjs';
import { BIN, PACKAGES_DIR, fillPendingDesign, linkToolchain, read } from '../lib.mjs';

const SCAFFOLD_TITLE = `init 生成的骨架：${Object.keys(CHECKS).length} 条判据 + build / typecheck / test / selfcheck 全绿；design.json 开箱是「（待填）」（填好才绿）`;
const LEFTOVER_TITLE = '探针清理干净（packages/ 下没有 .init-* 残留）';

export const checks = [
  {
    title: SCAFFOLD_TITLE,
    run(ctx, report) {

      const runScaffold = (template) => {

        const scaffold = mkdtempSync(join(PACKAGES_DIR, '.init-'));
        const scaffoldModules = join(scaffold, 'node_modules');

        const env = { ...process.env, DSH_WB_ROOT: scaffold };
        try {
          execFileSync(process.execPath, [BIN, 'init', 'demo', '--dir', scaffold, '--template', template], {
            stdio: 'pipe',
          });
          if (readdirSync(scaffold).some((name) => name.endsWith('.tpl'))) {
            throw new Error('init 留下了 .tpl 原件');
          }
          linkToolchain(ctx.toolchain, scaffoldModules);

          symlinkSync(join(PACKAGES_DIR, 'shared'), join(scaffoldModules, '@dsh-workbench', 'shared'), 'dir');

          mkdirSync(join(scaffoldModules, '@deepseek-ai'), { recursive: true });
          symlinkSync(
            join(PACKAGES_DIR, 'shared', 'node_modules', '@deepseek-ai', 'dsh-client-ui-primitives'),
            join(scaffoldModules, '@deepseek-ai', 'dsh-client-ui-primitives'),
            'dir',
          );

          execFileSync(process.execPath, [BIN, 'build', '--cwd', scaffold], { stdio: 'pipe', env });
          const generated = read(join(scaffold, 'client.js'));
          if (
            !generated.includes('window.__ModuleLoader__.load({') ||
            !generated.includes('"@dsh-workbench/module-demo"')
          ) {
            throw new Error('init 生成的骨架构建出来的 client.js 不像模块产物');
          }

          execFileSync(process.execPath, [BIN, 'check', '--cwd', scaffold], { stdio: 'pipe', env });

          if (template === 'diy') {
            let designFailure;
            try {
              execFileSync(process.execPath, [BIN, 'design', 'check', '--cwd', scaffold], { stdio: 'pipe', env });
            } catch (error) {
              designFailure = `${error.stdout ?? ''}${error.stderr ?? ''}`;
            }
            if (designFailure === undefined) {
              throw new Error('diy 模板的 design.json 没打「（待填）」哨兵：init 完 design check 就绿了');
            }
            if (!designFailure.includes('还空着')) {
              throw new Error(`diy 的 design check 没报「还空着」：${designFailure.trim().split('\n').slice(-2).join(' | ')}`);
            }
            fillPendingDesign(scaffold);
            execFileSync(process.execPath, [BIN, 'design', 'render', '--cwd', scaffold], { stdio: 'pipe', env });
          }

          for (const script of ['typecheck', 'test', 'selfcheck']) {
            execFileSync('pnpm', ['run', '--silent', script], { cwd: scaffold, stdio: 'pipe', env });
          }
        } finally {

          rmSync(scaffold, { recursive: true, force: true });
        }
      };

      let scaffoldFailure;
      for (const template of ['diy']) {
        try {
          runScaffold(template);
        } catch (error) {
          const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`
            .trim()
            .split('\n')
            .slice(-6)
            .join('\n  ');
          scaffoldFailure = `模板 ${template}：${error.message}${detail === '' ? '' : `\n  ${detail}`}`;
          break;
        }
      }

      report(SCAFFOLD_TITLE, scaffoldFailure === undefined, scaffoldFailure ?? '');
    },
  },
  {
    title: LEFTOVER_TITLE,
    run(_ctx, report) {

      const leftovers = readdirSync(PACKAGES_DIR).filter((name) => name.startsWith('.init-'));
      report(
        LEFTOVER_TITLE,
        leftovers.length === 0,
        leftovers.length === 0
          ? ''
          : `packages/${leftovers.join('、packages/')}（手动删掉它们再跑；它们会被当成真的模块包参与后面的每一条判据）`,
      );
    },
  },
];
