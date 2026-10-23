import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BIN, FACES, PACKAGES_DIR, PKG_ROOT, declaration, read } from '../lib.mjs';

export const checks = [
  {
    title: '契约随外壳出货：模块仓里读到它 → 绿；缺 board.css → 红并点名；完全没有外壳 → skip（不抛）',
    run(_ctx, report) {

      const title =
        '契约随外壳出货：模块仓里读到它 → 绿；缺 board.css → 红并点名；完全没有外壳 → skip（不抛）';
      const problems = [];
      const fake = mkdtempSync(join(tmpdir(), 'wb-module-repo-'));
      const toolDir = join(fake, 'node_modules', '@dsh-workbench', 'module-tools');
      const probe = join(fake, 'packages', 'demo-style');
      const coreBoard = join(fake, 'node_modules', '@dsh-workbench', 'core', 'dist', 'board.css');

      const sharedLink = join(fake, 'node_modules', '@dsh-workbench', 'shared');
      const run = () => {
        try {
          return {
            failed: false,
            out: String(
              execFileSync(
                process.execPath,
                [join(toolDir, 'bin', 'dsh-wb-module.mjs'), 'check', '--only', 'style'],
                { cwd: fake, encoding: 'utf8', stdio: 'pipe' },
              ),
            ),
          };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      try {
        mkdirSync(join(toolDir, 'bin'), { recursive: true });
        cpSync(BIN, join(toolDir, 'bin', 'dsh-wb-module.mjs'));
        cpSync(join(PKG_ROOT, 'src'), join(toolDir, 'src'), { recursive: true });

        symlinkSync(join(PKG_ROOT, 'node_modules'), join(toolDir, 'node_modules'), 'dir');
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-style',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: {
                  platform: 'web',
                  inject: ['@dsh-workbench/core'],
                  external: ['@dsh-workbench/core/client'],
                },
                workbench: declaration('demo-style'),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(
          join(probe, 'src', 'client.tsx'),
          "export const box = () => h('div', { className: 'wb-iconButton wb-note' }, 'x');\n",
        );
        mkdirSync(join(fake, 'node_modules', '@dsh-workbench', 'core', 'dist'), { recursive: true });
        writeFileSync(coreBoard, '.wb-iconButton:hover { color: var(--dsw-alias-label-primary); }\n');
        mkdirSync(join(fake, 'node_modules', '@dsh-workbench'), { recursive: true });
        symlinkSync(join(PACKAGES_DIR, 'shared'), sharedLink, 'dir');

        const shipped = run();
        if (shipped.failed) {
          problems.push(`模块仓里读到了随包出货的契约，却还是红的：${tail(shipped.out)}`);
        }

        rmSync(coreBoard);
        const withoutBoard = run();
        if (!withoutBoard.failed) {
          problems.push('外壳那份 board.css 不在，借 wb-iconButton 居然没红（真误报就没人管了）');
        } else if (!withoutBoard.out.includes('wb-iconButton')) {
          problems.push(`红是红了，但没点明是哪个类：${tail(withoutBoard.out)}`);
        }

        rmSync(join(fake, 'node_modules', '@dsh-workbench', 'core'), { recursive: true, force: true });
        rmSync(sharedLink, { recursive: true, force: true });
        const noShell = run();
        if (noShell.failed) {
          problems.push(`找不到契约时应该 skip（不是抛异常）：${tail(noShell.out)}`);
        } else if (!noShell.out.includes('一条都没查')) {
          problems.push(`skip 了但没说清"不是没问题"：${tail(noShell.out)}`);
        }
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      } finally {
        rmSync(fake, { recursive: true, force: true });
      }
      report(title, problems.length === 0, problems.join(' · '));
    },
  },
  {
    title: '插件名只有一处真相：与清单一致 → 不报；改名没跟（含 ?? 兜底）→ 红并点名',
    run(_ctx, report) {

      const title = '插件名只有一处真相：与清单一致 → 不报；改名没跟（含 ?? 兜底）→ 红并点名';
      const problems = [];
      const probe = mkdtempSync(join(PACKAGES_DIR, '.pluginname-'));
      const clientFile = join(probe, 'src/client.tsx');
      const write = (pluginName, call) => {
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-pluginname',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: {
                  platform: 'web',
                  inject: ['@dsh-workbench/core'],
                  external: ['@dsh-workbench/core/client'],
                },
                workbench: declaration('demo-pluginname', {
                  env: { command: 'opencli', plugins: [{ name: pluginName, commands: ['x'] }] },
                }),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(clientFile, call);
      };
      const run = () => {
        try {
          return {
            failed: false,
            out: String(
              execFileSync(process.execPath, [BIN, 'check', '--only', 'contracts'], {
                cwd: probe,
                encoding: 'utf8',
                stdio: 'pipe',
              }),
            ),
          };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      try {
        mkdirSync(join(probe, 'dist'), { recursive: true });
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');
        writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');
        writeFileSync(
          join(probe, 'dist/host.js'),
          `export const name = '@dsh-workbench/module-demo-pluginname';
export const inject = ['workbenchUnits'];
const mount = () => ({ routes: {}, registerTools: () => [] });
const face = { unit: 'demo-pluginname', mount };
export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register(face), 'demo-pluginname');
}
`,
        );

        write('demo', "export const call = () => createOpencli({ plugin: 'demo' });\n");
        const aligned = run();
        if (aligned.out.includes('不在清单的 env.plugins[] 里')) {
          problems.push(`插件名与清单一致却报了漂移：${tail(aligned.out)}`);
        }

        write('demo', "export const call = () => createOpencli({ plugin: 'stale-name' });\n");
        const drifted = run();
        if (!drifted.out.includes('不在清单的 env.plugins[] 里')) {
          problems.push(`代码里的插件名对不上清单，居然没红：${tail(drifted.out)}`);
        } else if (!drifted.out.includes('stale-name') || !drifted.out.includes('demo')) {
          problems.push(`红是红了，但没说清"现在写的是谁、清单里是谁"：${tail(drifted.out)}`);
        }

        write('renamed', "export const call = () => createOpencli({ plugin: manifest() ?? 'demo' });\n");
        const fallback = run();
        if (!fallback.out.includes('不在清单的 env.plugins[] 里')) {
          problems.push(`兜底那个字面量（?? 后面那个）对不上清单，居然没红：${tail(fallback.out)}`);
        }
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(title, problems.length === 0, problems.join(' · '));
    },
  },
  {
    title: '工具名只有清单一处写者：sync 生成物→放行；手改/半写 key/字面量写回源码 → 各自判红',
    run(_ctx, report) {

      const title = '工具名只有清单一处写者：sync 生成物→放行；手改/半写 key/字面量写回源码 → 各自判红';
      const problems = [];
      const probe = mkdtempSync(join(PACKAGES_DIR, '.declared-'));
      const generated = join(probe, 'src/declared-tools.ts');
      const clientFile = join(probe, 'src/client.tsx');
      const tool = (key, name) => ({
        name: name ?? 'workbench_demo_declared_run',
        writes: false,
        ...(key === null ? {} : { key }),
      });
      const write = (tools, call) => {
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-declared',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: {
                  platform: 'web',
                  inject: ['@dsh-workbench/core'],
                  external: ['@dsh-workbench/core/client'],
                },
                workbench: declaration('demo-declared', { tools }),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(clientFile, call);
      };
      const run = (...args) => {
        try {
          return {
            failed: false,
            out: String(
              execFileSync(process.execPath, [BIN, ...args], { cwd: probe, encoding: 'utf8', stdio: 'pipe' }),
            ),
          };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      const check = () => run('check', '--only', 'contracts').out;
      const tail = (out) => out.trim().split('\n').slice(-4).join(' | ');
      try {
        mkdirSync(join(probe, 'dist'), { recursive: true });
        mkdirSync(join(probe, 'src'), { recursive: true });
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');
        writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');
        writeFileSync(
          join(probe, 'dist/host.js'),
          `export const name = '@dsh-workbench/module-demo-declared';
export const inject = ['workbenchUnits'];
const mount = () => ({ routes: {}, registerTools: () => [] });
const face = { unit: 'demo-declared', mount };
export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register(face), 'demo-declared');
}
`,
        );

        write([tool(null)], 'export const card = null;\n');
        const noKeys = run('sync');
        if (!noKeys.failed) problems.push('一个 key 都没写，sync 居然成功了');
        if (!noKeys.out.includes('没有 key')) {
          problems.push(`sync 红了但没说清缺 key：${tail(noKeys.out)}`);
        }
        if (check().includes('declared-tools.ts')) {
          problems.push('一个 key 都没写（不适用那一档），判据却找了生成物');
        }

        write([tool('run')], 'export const card = null;\n');
        const wrote = run('sync');
        if (wrote.failed) problems.push(`sync 没写出来：${tail(wrote.out)}`);
        const body = read(generated);
        if (!body.includes("run: { name: 'workbench_demo_declared_run', writes: false }")) {
          problems.push(`生成物形状不对：${body.split('\n').slice(0, 3).join(' | ')}`);
        }
        if (check().includes('declared-tools.ts')) {
          problems.push(`刚 sync 完判据还说生成物不对：${tail(check())}`);
        }

        writeFileSync(generated, body.replace('writes: false', 'writes: true'));
        const handEdited = check();
        if (!handEdited.includes('declared-tools.ts 与清单对不上')) {
          problems.push(`手改了生成物居然没红：${tail(handEdited)}`);
        }

        write([tool('run'), tool(null, 'workbench_demo_declared_list')], 'export const card = null;\n');
        const half = check();
        if (!half.includes('没有 key')) problems.push(`半写 key 居然没红：${tail(half)}`);

        write(
          [tool('run'), tool('list', 'workbench_demo_declared_list')],
          "export const call = () => runTool('workbench_demo_declared_run');\n",
        );
        run('sync');
        const literal = check();
        if (!literal.includes('工具名的字面量又写回了源码')) {
          problems.push(`源码里又写了工具名字面量，居然没红：${tail(literal)}`);
        }
      } catch (error) {
        problems.push(error instanceof Error ? error.message : String(error));
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
      report(title, problems.length === 0, problems.join(' · '));
    },
  },
];
