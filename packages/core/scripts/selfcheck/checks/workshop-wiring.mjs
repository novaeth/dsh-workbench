import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

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

    title: '★ 可写根由产品代码声明，不进 profile / bundle 任何一层',
    run(_ctx, report) {
      const inBundle = bundlePatch()
        .split(/^-\s+/m)
        .some((item) => /^id:\s*sandbox-policy\s*$/m.test(item));
      const host = `${read(pkg('src/app/host.ts'))}\n${read(pkg('src/shared/api/host/workbench-seam.ts'))}`;
      const declares =
        host.includes('provideWorkbenchSeam(') &&
        host.includes('createSeam(') &&
        host.includes('const runtimeRoot = workbenchRoot()') &&
        read(join(PKG, '../shared/src/host/seam/run.ts')).includes('export function createSeam');
      const fileGone = !existsSync(pkg('profile/sandbox.patch.yml'));
      report(
        '★ 可写根由产品代码声明，不进 profile / bundle 任何一层',
        !inBundle && declares && fileGone,
        `bundle 层${inBundle ? '仍有' : '没有'} · 产品代码${declares ? '声明了' : '没声明'} · profile/sandbox.patch.yml ${fileGone ? '已删' : '还在'}`,
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
            'scripts/profile-dsh-layer.mjs',
            'scripts/share-data-root.mjs',
          ];
          const missing = wanted.filter((entry) => !(manifest.files ?? []).includes(entry));
          return missing.length === 0;
        })(),
      );
    },
  },
  {

    title: '★ 宿主自举的行为探针（运行时入口 / 工坊入口 / 不装依赖 / PATH）',
    async run(ctx, report) {
      const fresh = mkdtempSync(join(tmpdir(), 'dsh-wb-bootstrap-'));
      const pathBefore = process.env.PATH;
      const homeBefore = process.env.DSH_HOME;
      const workbenchBefore = process.env.DSH_WORKBENCH_HOME;
      process.env.DSH_HOME = fresh;
      delete process.env.DSH_WORKBENCH_HOME;
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
        const { createSeam } = await import('@dsh-workbench/shared/host');
        const seam = createSeam({
          shell: {
            resolve: (request) => request,
            execute: async () => ({
              result: async () => ({
                exitCode: 0,
                timedOut: false,
                aborted: false,
                stdout: { text: '', truncated: false },
                stderr: { text: '', truncated: false },
              }),
            }),
          },
          runtimeRoot: join(fresh, 'workbench'),
          allowHost: true,
        });
        provided.set('workbenchSeam', seam);
        await ctx.host.apply(probeCtx);
        let wrapper = '';
        for (const file of entriesUnder(fresh)) {
          const body = read(file);
          if (!body.startsWith('#!') || !body.includes('DSH_HOME')) continue;
          wrapper = file;
          break;
        }
        report(
          '★ 宿主自举写得下隔离运行时入口（可执行脚本，DSH_HOME 钉在命令里）',
          wrapper !== '',
          wrapper || '没找到与适配器描述一致的那份入口',
        );

        const entry = join(fresh, 'workbench', 'bin', 'dsh-wb-module');
        let probe = 'missing';
        for (let attempt = 0; attempt < 60; attempt += 1) {
          if (executable(entry)) {
            probe = 'ok';
            break;
          }
          await sleep(250);
        }
        report('★ 宿主自举把工坊入口挂上（脱离执行缝跑随包脚本）', probe === 'ok', probe);
        report(
          '★ 仓库工作树副本不在启动时装工坊依赖（那是启动器/开发路径的事）',
          !existsSync(join(fresh, 'workbench', 'diy', 'package.json')),
        );
        const pathHead = (process.env.PATH ?? '').split(delimiter).slice(0, 3);
        report(
          '★ 自举把 workbench/bin 与运行时自己的 bin 一起前插进 PATH（子进程按名字找到同一份）',
          pathHead.includes(join(fresh, 'workbench', 'bin')) &&
            pathHead.includes(dirname(wrapper)),
          pathHead.join(delimiter),
        );
      } finally {
        process.env.PATH = pathBefore;
        if (homeBefore === undefined) delete process.env.DSH_HOME;
        else process.env.DSH_HOME = homeBefore;
        if (workbenchBefore === undefined) delete process.env.DSH_WORKBENCH_HOME;
        else process.env.DSH_WORKBENCH_HOME = workbenchBefore;
        rmSync(fresh, { recursive: true, force: true });
      }
    },
  },
];

function executable(file) {
  if (!existsSync(file)) return false;
  return process.platform === 'win32' || (statSync(file).mode & 0o111) !== 0;
}

function entriesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...entriesUnder(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}
