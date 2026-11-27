import { execaSync } from 'execa';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { declaration, manifestOf, scaffoldModule, BIN, PACKAGES_DIR } from '../lib.mjs';

function contractsOf(probe, env = process.env) {
  const result = execaSync(process.execPath, [BIN, 'check', '--only', 'contracts'], {
    cwd: probe,
    env,
    encoding: 'utf8',
    reject: false,
  });
  return { failed: result.exitCode !== 0, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

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
        writeFileSync(join(probe, 'package.json'), manifestOf('demo-env', declaration('demo-env', { needs: libs })));
      const runContracts = () => contractsOf(probe);
      try {
        scaffoldModule(probe);

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
      const runContracts = () => contractsOf(probe);
      try {
        scaffoldModule(probe);
        writeFileSync(join(probe, 'package.json'), manifestOf('demo-longtask'));

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
        if (!badShape.out.includes('缺少方法')) {
          throw new Error(`判红了，但没说清注册表缺方法：\n${badShape.out}`);
        }

        const FULL = [
          'start: () => ({})',
          'snapshot: () => null',
          'active: () => null',
          'current: () => []',
          'live: () => []',
          'recent: () => []',
          'stop: () => false',
          'seen: () => false',
          'onChange: () => () => {}',
          'recheck: () => false',
          'answer: () => false',
        ];
        const withoutOf = (method) =>
          `{ ${FULL.filter((entry) => !entry.startsWith(`${method}:`)).join(', ')} }`;

        for (const method of ['stop', 'live', 'seen']) {
          writeFileSync(join(probe, 'dist/host.js'), faceSource(withoutOf(method)));
          const outcome = runContracts();
          if (!outcome.failed) throw new Error(`注册表只缺 ${method}，居然没被判红`);
          if (!outcome.out.includes(`缺少方法 ${method}`)) {
            throw new Error(`判红了，但没点出缺的是 ${method}：\n${outcome.out}`);
          }
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
      const runContracts = () => contractsOf(probe);
      try {
        scaffoldModule(probe);
        writeFileSync(join(probe, 'package.json'), manifestOf('demo-linkage'));

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
        writeFileSync(join(probe, 'package.json'), manifestOf('demo-plugincmd', declaration('demo-plugincmd', {
                  needs: plugins.map((plugin) => ({
                    kind: 'extension',
                    runtime: 'opencli',
                    name: plugin.name,
                    commands: plugin.commands,
                    purpose: '测试',
                    ...(plugin.sources === undefined ? {} : { sources: plugin.sources }),
                  })),
                })));
      const runContracts = () => contractsOf(probe, { ...process.env, DSH_HOME: fakeHome, DSH_WB_OPENCLI_CATALOG: catalog });
      try {
        scaffoldModule(probe);
        mkdirSync(extDir, { recursive: true });
        writeFileSync(catalog, JSON.stringify([{ command: 'demo/good', site: 'demo', name: 'good', aliases: ['g'] }]));
        writeFileSync(join(extDir, 'ok.js'), '');
        writeFileSync(join(extDir, 'index.js'), '');

        const writeDemoPkg = (commands) =>
          writePkg([
            { name: 'demo', commands, sources: [{ kind: 'builtin' }] },
            { name: 'ext', commands: ['ok'] },
            { name: 'never-seen', commands: ['whatever'] },
          ]);
        writeDemoPkg(['good', 'nope']);
        writeFileSync(join(probe, 'dist/host.js'), faceSource());
        const bad = runContracts();
        if (!bad.failed) throw new Error('命令名写错了，居然没被判红');
        if (!bad.out.includes('nope')) throw new Error(`判红了，但没点出写错的命令名：\n${bad.out}`);
        if (bad.out.includes('whatever')) {
          throw new Error('对"这台机器上根本没装的插件"误伤了（那种情形没得对，不该红）');
        }

        writeDemoPkg(['good', 'g']);
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
