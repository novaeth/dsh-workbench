import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BIN, FACES, PACKAGES_DIR, declaration } from '../lib.mjs';

export const checks = [
  {
    title: '外部供给：need 形状不对就红，声明了 lib 没给 libInstallCommand 也红，补齐就过',
    run(_ctx, report) {

      const title = '外部供给：need 形状不对就红，声明了 lib 没给 libInstallCommand 也红，补齐就过';
      const probe = mkdtempSync(join(PACKAGES_DIR, '.envneed-'));
      const lib = {
        kind: 'lib',
        name: 'x-lib',
        purpose: '测试用',
        sources: [{ kind: 'npm', registryEnv: 'X_REG', registryDefault: 'https://r.test/' }],
      };
      const badLib = {
        kind: 'lib',
        name: 'x-lib',
        purpose: '',
        sources: [{ kind: 'npm', registryEnv: '', registryDefault: 'not-a-url' }],
      };
      const faceSource = (withHelper) => `${withHelper ? "const install = { helper: 'libInstallCommand' };\n" : ''}const face = {
  unit: 'demo-env',
  mount: () => ({ routes: {}, registerTools: () => [] }),
};
export const name = '@dsh-workbench/module-demo-env';
export const inject = ['workbenchUnits'];
export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register(face), 'demo-env');
}
`;
      const writePkg = (libs) =>
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-env',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-env', { needs: libs }),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
      const runContracts = () => {
        try {
          const out = execFileSync(process.execPath, [BIN, 'check', '--only', 'contracts'], {
            cwd: probe,
            encoding: 'utf8',
            stdio: 'pipe',
          });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        mkdirSync(join(probe, 'dist'), { recursive: true });
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');
        writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');
        writeFileSync(join(probe, 'src/client.tsx'), 'export const card = null;\n');

        writePkg([badLib]);
        writeFileSync(join(probe, 'dist/host.js'), faceSource(false));
        const badShape = runContracts();
        if (!badShape.failed) throw new Error('need 形状不对，居然没被判红');
        for (const needle of ['registryDefault', 'purpose']) {
          if (!badShape.out.includes(needle)) {
            throw new Error(`形状不对判红了，但没点出「${needle}」：\n${badShape.out}`);
          }
        }

        writePkg([lib]);
        writeFileSync(join(probe, 'dist/host.js'), faceSource(false));
        const noHelper = runContracts();
        if (!noHelper.failed) throw new Error('声明了 libs 却没给安装命令，居然没被判红');
        if (!noHelper.out.includes('libInstallCommand')) {
          throw new Error(`判红了，但没说清要用 libInstallCommand：\n${noHelper.out}`);
        }

        writePkg([lib]);
        writeFileSync(join(probe, 'dist/host.js'), faceSource(true));
        const green = runContracts();
        if (green.failed) throw new Error(`补齐之后还是红的（一刀切了）：\n${green.out}`);
        report(title, true);
      } catch (error) {
        report(title, false, `外部供给的判据坏了：${error.message}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
  {
    title: '长任务：注册了却在客户端画不出来 → 红；画出来 → 过；注册表缺方法（含只缺 stop / live）→ 红',
    run(_ctx, report) {

      const title = '长任务：注册了却在客户端画不出来 → 红；画出来 → 过；注册表缺方法（含只缺 stop / live）→ 红';
      const probe = mkdtempSync(join(PACKAGES_DIR, '.longtask-'));
      const faceSource = (registry) => `const face = {
  unit: 'demo-longtask',
  mount: ({ longTasks }) => {
    const runs = longTasks?.create({
      key: 'rebuild',
      run: async () => ({}),
      view: () => ({}),
    });
    return { routes: {}, registerTools: () => [], longTasks: ${registry} };
  },
};
export const name = '@dsh-workbench/module-demo-longtask';
export const inject = ['workbenchUnits'];
export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register(face), 'demo-longtask');
}
`;
      const runContracts = () => {
        try {
          const out = execFileSync(process.execPath, [BIN, 'check', '--only', 'contracts'], {
            cwd: probe,
            encoding: 'utf8',
            stdio: 'pipe',
          });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        mkdirSync(join(probe, 'dist'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-longtask',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-longtask'),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');
        writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');
        writeFileSync(join(probe, 'src/client.tsx'), 'export const card = null;\n');

        writeFileSync(join(probe, 'dist/host.js'), faceSource('runs'));
        const noRenderer = runContracts();
        if (!noRenderer.failed) throw new Error('注册了长任务却没画出来，居然没被判红');
        if (!noRenderer.out.includes('useLongTask')) {
          throw new Error(`判红了，但没说清客户端要用 kit 那套：\n${noRenderer.out}`);
        }

        writeFileSync(
          join(probe, 'client.js'),
          'window.__ModuleLoader__.load({ id: "@dsh-workbench/module-demo-longtask", factory: () => ({ useLongTask: 1 }) });\n',
        );
        const green = runContracts();
        if (green.failed) throw new Error(`画出来之后还是红的（一刀切了）：\n${green.out}`);

        writeFileSync(join(probe, 'dist/host.js'), faceSource('{ start: () => ({}) }'));
        const badShape = runContracts();
        if (!badShape.failed) throw new Error('注册表缺方法，居然没被判红');
        if (!badShape.out.includes('缺方法')) {
          throw new Error(`判红了，但没说清注册表缺方法：\n${badShape.out}`);
        }

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            '{ start: () => ({}), snapshot: () => null, active: () => null, current: () => [], live: () => [], onChange: () => () => {} }',
          ),
        );
        const noStop = runContracts();
        if (!noStop.failed) throw new Error('注册表只缺 stop，居然没被判红');
        if (!noStop.out.includes('缺方法 stop')) {
          throw new Error(`判红了，但没点出缺的是 stop：\n${noStop.out}`);
        }

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            '{ start: () => ({}), snapshot: () => null, active: () => null, current: () => [], stop: () => false, onChange: () => () => {} }',
          ),
        );
        const noLive = runContracts();
        if (!noLive.failed) throw new Error('注册表只缺 live，居然没被判红');
        if (!noLive.out.includes('缺方法 live')) {
          throw new Error(`判红了，但没点出缺的是 live：\n${noLive.out}`);
        }
        report(title, true);
      } catch (error) {
        report(title, false, `长任务的判据坏了：${error.message}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
  {
    title: '联动层：context / factsOf / warmReads 的形状不对就红，写对了就过',
    run(_ctx, report) {

      const title = '联动层：context / factsOf / warmReads 的形状不对就红，写对了就过';
      const probe = mkdtempSync(join(PACKAGES_DIR, '.linkage-'));
      const faceSource = (linkage) => `const face = {
  unit: 'demo-linkage',
  mount: () => ({ routes: {}, registerTools: () => [], ${linkage} }),
};
export const name = '@dsh-workbench/module-demo-linkage';
export const inject = ['workbenchUnits'];
export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register(face), 'demo-linkage');
}
`;
      const runContracts = () => {
        try {
          const out = execFileSync(process.execPath, [BIN, 'check', '--only', 'contracts'], {
            cwd: probe,
            encoding: 'utf8',
            stdio: 'pipe',
          });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        mkdirSync(join(probe, 'dist'), { recursive: true });
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-linkage',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-linkage'),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');
        writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');
        writeFileSync(join(probe, 'src/client.tsx'), 'export const card = null;\n');

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            "context: { kinds: [], render: 1 }, factsOf: () => [1], warmReads: () => ['inventory']",
          ),
        );
        const bad = runContracts();
        if (!bad.failed) throw new Error('联动层形状不对，居然没被判红');
        for (const needle of ['context.kinds', 'context.render', 'factsOf', 'warmReads']) {
          if (!bad.out.includes(needle)) {
            throw new Error(`判红了，但没点出「${needle}」：\n${bad.out}`);
          }
        }

        writeFileSync(
          join(probe, 'dist/host.js'),
          faceSource(
            "context: { kinds: ['module'], render: () => 'ok' }, factsOf: () => undefined, warmReads: () => [['inventory', 'enterprises']]",
          ),
        );
        const green = runContracts();
        if (green.failed) throw new Error(`形状写对之后还是红的（一刀切了）：\n${green.out}`);
        report(title, true);
      } catch (error) {
        report(title, false, `联动层的判据坏了：${error.message}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
      }
    },
  },
  {
    title: '插件命令：写错就红（点名叫它），别名/已装插件/没装过的插件都不误伤',
    run(_ctx, report) {

      const title = '插件命令：写错就红（点名叫它），别名/已装插件/没装过的插件都不误伤';
      const probe = mkdtempSync(join(PACKAGES_DIR, '.plugincmd-'));
      const fakeHome = mkdtempSync(join(tmpdir(), 'dsh-home-'));
      const catalog = join(fakeHome, 'cli-manifest.json');
      const extDir = join(fakeHome, 'workbench/opencli/plugins-npm/node_modules/opencli-plugin-ext');
      const faceSource = () => `const face = { unit: 'demo-plugincmd', mount: () => ({ routes: {}, registerTools: () => [] }) };
export const name = '@dsh-workbench/module-demo-plugincmd';
export const inject = ['workbenchUnits'];
export function apply(ctx) {
  const units = ctx.get('workbenchUnits');
  if (units === undefined) return;
  ctx.effect(() => units.register(face), 'demo-plugincmd');
}
`;
      const writePkg = (plugins) =>
        writeFileSync(
          join(probe, 'package.json'),
          JSON.stringify(
            {
              name: '@dsh-workbench/module-demo-plugincmd',
              version: '0.0.1',
              private: true,
              type: 'module',
              peerDependencies: { '@dsh-workbench/core': '^0.1.0' },
              scripts: { build: 'x', typecheck: 'x', test: 'x', selfcheck: 'x' },
              dsh: {
                bundle: { patch: './cordis.patch.yml' },
                client: { platform: 'web', inject: ['@dsh-workbench/core'], external: ['@dsh-workbench/core/client'] },
                workbench: declaration('demo-plugincmd', {
                  needs: plugins.map((plugin) => ({
                    kind: 'extension',
                    runtime: 'opencli',
                    name: plugin.name,
                    commands: plugin.commands,
                    purpose: '测试',
                  })),
                }),
                workbenchFaces: FACES,
              },
            },
            null,
            2,
          ),
        );
      const runContracts = () => {
        try {
          const out = execFileSync(process.execPath, [BIN, 'check', '--only', 'contracts'], {
            cwd: probe,
            env: { ...process.env, DSH_HOME: fakeHome, DSH_WB_OPENCLI_CATALOG: catalog },
            encoding: 'utf8',
            stdio: 'pipe',
          });
          return { failed: false, out: String(out) };
        } catch (error) {
          return { failed: true, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
        }
      };
      try {
        mkdirSync(join(probe, 'src'), { recursive: true });
        mkdirSync(join(probe, 'dist'), { recursive: true });
        mkdirSync(extDir, { recursive: true });
        writeFileSync(catalog, JSON.stringify([{ command: 'demo/good', site: 'demo', name: 'good', aliases: ['g'] }]));
        writeFileSync(join(extDir, 'ok.js'), '');
        writeFileSync(join(extDir, 'index.js'), '');
        writeFileSync(join(probe, 'cordis.patch.yml'), '- id: workbench\n');
        writeFileSync(join(probe, 'src/host.ts'), 'export const manifest = {};\n');
        writeFileSync(join(probe, 'src/client.tsx'), 'export const card = null;\n');

        writePkg([
          { name: 'demo', commands: ['good', 'nope'] },
          { name: 'ext', commands: ['ok'] },
          { name: 'never-seen', commands: ['whatever'] },
        ]);
        writeFileSync(join(probe, 'dist/host.js'), faceSource());
        const bad = runContracts();
        if (!bad.failed) throw new Error('命令名写错了，居然没被判红');
        if (!bad.out.includes('nope')) throw new Error(`判红了，但没点出写错的命令名：\n${bad.out}`);
        if (bad.out.includes('whatever')) {
          throw new Error('对"这台机器上根本没装的插件"误伤了（那种情形没得对，不该红）');
        }

        writePkg([
          { name: 'demo', commands: ['good', 'g'] },
          { name: 'ext', commands: ['ok'] },
          { name: 'never-seen', commands: ['whatever'] },
        ]);
        writeFileSync(join(probe, 'dist/host.js'), faceSource());
        const green = runContracts();
        if (green.failed) throw new Error(`改对之后还是红的（别名也该算）：\n${green.out}`);
        report(title, true);
      } catch (error) {
        report(title, false, `插件命令的判据坏了：${error.message}`);
      } finally {
        rmSync(probe, { recursive: true, force: true });
        rmSync(fakeHome, { recursive: true, force: true });
      }
    },
  },
];
