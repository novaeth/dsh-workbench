import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PKG, pkg, read } from '../lib.mjs';

const bundlePatch = () =>
  read(pkg('cordis.patch.yml'))
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

const launcher = () => read(pkg('bin/dsh-workbench'));

const seedWorkshop = () => read(pkg('scripts/seed-workshop.sh'));

export const checks = [
  {
    title: '★ hmr 监听根包含 DIY 工坊（少了它模块改了不热换，且不报错）',
    run(_ctx, report) {
      const rows = bundlePatch().split(/^-\s+/m);
      const row = rows.find((item) => /^id:\s*hmr\s*$/m.test(item)) ?? '';
      report(
        '★ hmr 监听根包含 DIY 工坊（少了它模块改了不热换，且不报错）',
        row.includes("dshHomePath('workbench/diy')"),
      );
    },
  },
  {

    title: '★ hmr 的 ignored 抄全六条（少了 *(../) 那两条 node_modules 实目录会全进监听表）',
    run(_ctx, report) {
      const row = bundlePatch().split(/^-\s+/m).find((item) => /^id:\s*hmr\s*$/m.test(item)) ?? '';
      const items = row
        .split('\n')
        .map((line) => line.match(/^\s*-\s+(.+?)\s*$/)?.[1])
        .filter(Boolean)
        .map((one) => one.replace(/^['"]|['"]$/g, ''));
      const missing = ['**/node_modules', '**/.*', 'cache', 'data', '*(../)**/node_modules', '*(../)**/.*'].filter(
        (needle) => !items.includes(needle),
      );
      report(
        '★ hmr 的 ignored 抄全六条（少了 *(../) 那两条 node_modules 实目录会全进监听表）',
        missing.length === 0,
        missing.map((one) => `缺 ${one}`).join('、'),
      );
    },
  },
  {
    title: '★ 启动器每次启动都建工坊目录（chokidar 对不存在的根收不到事件）',
    run(_ctx, report) {
      report(
        '★ 启动器每次启动都建工坊目录（chokidar 对不存在的根收不到事件）',
        /mkdir -p[^\n]*(?:WORKBENCH_HOME|workbench)\/diy\/packages/.test(launcher()),
      );
    },
  },
  {
    title: '★ 启动器写的隔离入口也把 DSH_HOME 钉在命令里',
    run(_ctx, report) {

      report(
        '★ 启动器写的隔离入口也把 DSH_HOME 钉在命令里',
        /exec env DSH_HOME=%q bash %q/.test(launcher()),
      );
    },
  },
  {
    title: '★ DIY 指引的软链只有一份写口（在 seed-workshop.sh 的 link_workshop_skills 里，源优先基准那份）',
    run(_ctx, report) {

      const seed = seedWorkshop();
      report(
        '★ DIY 指引的软链只有一份写口（在 seed-workshop.sh 的 link_workshop_skills 里，源优先基准那份）',
        seed.includes('link_workshop_skills()') &&
          seed.includes('$DIY_DIR/.agents/skills/workbench-module-diy') &&
          seed.includes('$SHELL_ROOT/skills/workbench-module-diy') &&
          seed.includes('$REPO_DIR/skills/workbench-module-diy') &&

          seed.split('link_workshop_skills\n').length - 1 >= 2 &&

          !launcher().includes('ln -s') &&
          !launcher().includes('.agents/skills'),
        `写口 ${seed.includes('link_workshop_skills()') ? '在' : '不在'} · 启动器里${launcher().includes('.agents/skills') ? '还有残留' : '没有残留'}`,
      );
    },
  },
  {
    title: '★ 工坊骨架把 pnpm 与 store/cache 钉死在工坊内（否则 agent 的 install 会被沙箱拒）',
    run(_ctx, report) {
      const seed = seedWorkshop();
      const seedBits = [
        ['钉住 pnpm', '"packageManager": "$PNPM_PIN"'],
        ['store 在工坊内', 'store-dir=$DIY_DIR/.pnpm-store'],
        ['cache 在工坊内', 'cache-dir=$DIY_DIR/.npm-cache'],
      ].filter(([, needle]) => !seed.includes(needle));
      report(
        '★ 工坊骨架把 pnpm 与 store/cache 钉死在工坊内（否则 agent 的 install 会被沙箱拒）',
        seedBits.length === 0,
        seedBits.map(([label]) => label).join('、'),
      );
    },
  },
  {

    title: '★ 可写根不进 bundle 层（在线启用会撞 session-controller 的重组竞态）',
    run(_ctx, report) {
      const inBundle = bundlePatch()
        .split(/^-\s+/m)
        .some((item) => /^id:\s*sandbox-policy\s*$/m.test(item));
      const hasRow = (text) =>
        /^-\s*id:\s*sandbox-policy\s*$/m.test(text) &&
        (text.includes("workspaceRoot: !!js dshHomePath('workbench')") ||
          text.includes("workspaceRoot: !!js process.env.DSH_WORKBENCH_HOME ?? dshHomePath('workbench')"));
      const inLauncher = hasRow(read(pkg('profile/sandbox.patch.yml')));
      const seed = read(pkg('scripts/seed-profile.sh'));
      const seedCalls = seed.includes('scripts/share-data-root.mjs');
      report(
        '★ 可写根不进 bundle 层（在线启用会撞 session-controller 的重组竞态）',
        !inBundle && inLauncher && seedCalls,
        `bundle 层${inBundle ? '仍有' : '没有'} · 启动器那份${inLauncher ? '在' : '缺了'} · seed ${seedCalls ? '会把这一行补进 profile' : '没走 share-data-root'}`,
      );
    },
  },
  {

    title: '★ 随包脚本都在 package.json 的 files 里（漏了 = 装出去那台静默什么都不做）',
    run(_ctx, report) {
      report(
        '★ 随包脚本都在 package.json 的 files 里（漏了 = 装出去那台静默什么都不做）',
        (() => {
          const manifest = JSON.parse(read(pkg('package.json')));
          const wanted = [
            'scripts/seed-profile.sh',
            'scripts/seed-workshop.sh',
            'scripts/clone-profile.mjs',
            'scripts/create-workbench.mjs',
            'scripts/patch-blocks.mjs',
            'scripts/share-data-root.mjs',
          ];
          const missing = wanted.filter((entry) => !(manifest.files ?? []).includes(entry));
          return missing.length === 0;
        })(),
      );
    },
  },
  {

    title: '★ 宿主自举的行为探针（隔离 opencli 入口 / 工坊入口 / 不装依赖 / PATH）',
    async run(ctx, report) {
      const fresh = execFileSync('bash', ['-c', 'mktemp -d'], { encoding: 'utf8' }).trim();
      const pathBefore = process.env.PATH;
      const provided = new Map();
      const probeCtx = {
        effect: (fn) => {
          fn();
          return () => {};
        },
        on: () => () => {},
        inject: () => () => {},
        provide: (name, value) => {
          provided.set(name, value);
          return () => {};
        },
        logger: { info: () => {}, warn: () => {} },
        webServer: { register: () => () => {} },
        get: (name) => (name === 'dshHomePath' ? (rel) => join(fresh, rel) : provided.get(name)),
      };
      try {
        await ctx.host.apply(probeCtx);
        const wrapper = join(fresh, 'workbench', 'opencli', 'bin', 'opencli');
        const body = existsSync(wrapper) ? read(wrapper) : '';
        const selfScript = join(PKG, 'bin', 'opencli-isolated');
        report(
          '★ 宿主自举写得下隔离 opencli 入口，指向**本包**那份，且把 DSH_HOME 钉在命令里',
          body.includes(selfScript) && body.includes(`DSH_HOME='${fresh}'`),
          body.trim() || wrapper,
        );

        const entry = join(fresh, 'workbench', 'bin', 'dsh-wb-module');
        const probe = (() => {
          try {
            return execFileSync(
              'bash',
              [
                '-c',
                `for i in $(seq 1 60); do [ -x ${JSON.stringify(entry)} ] && { echo ok; exit 0; }; sleep 0.25; done; echo missing`,
              ],
              { encoding: 'utf8' },
            ).trim();
          } catch (error) {
            return `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
          }
        })();
        report('★ 宿主自举把工坊入口挂上（脱离执行缝跑随包脚本）', probe === 'ok', probe);
        report(
          '★ 仓库工作树副本不在启动时装工坊依赖（那是启动器/开发路径的事）',
          !existsSync(join(fresh, 'workbench', 'diy', 'package.json')),
        );
        const pathHead = (process.env.PATH ?? '').split(':').slice(0, 3);
        report(
          '★ 自举把 workbench/bin 与隔离运行的 opencli/bin 一起前插进 PATH（子进程按名字找到同一份）',
          pathHead.includes(join(fresh, 'workbench', 'bin')) &&
            pathHead.includes(join(fresh, 'workbench', 'opencli', 'bin')),
          pathHead.join(':'),
        );
      } finally {
        process.env.PATH = pathBefore;
        execFileSync('bash', ['-c', `rm -rf ${JSON.stringify(fresh)}`]);
      }
    },
  },
];
