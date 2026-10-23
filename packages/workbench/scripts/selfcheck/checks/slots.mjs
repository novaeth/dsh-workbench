import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { read, pkg, SRC } from '../lib.mjs';

const panelCss = (injectedStyles) => injectedStyles[0]?.textContent ?? '';
const rightbarSource = () => read(pkg('src/app/layouts/rightbar/Rightbar.tsx'));
const panelModule = () => read(pkg('src/app/layouts/rightbar/Rightbar.module.css'));

export const checks = [
  {
    title: '★ 发布图里没有夹具（发布入口的可达图里不许出现夹具模块；夹具只许走 @/dev/surface 接缝）',
    run(ctx, report) {

      const srcRoot = pathToFileURL(`${SRC}/`);
      const root = fileURLToPath(srcRoot);
      const rel = (url) => fileURLToPath(url).slice(root.length);

      const resolveSpec = (spec, from) => {
        if (spec === '@/dev/surface') return new URL('dev/surface.stub.ts', srcRoot);
        if (spec.startsWith('@/')) return new URL(spec.slice(2), srcRoot);
        if (spec.startsWith('.')) return new URL(spec, from);
        return null;
      };
      const resolve = (spec, from) => {
        const base = resolveSpec(spec, from);
        if (base === null) return null;
        for (const candidate of [
          base,
          new URL(`${base.href}.ts`),
          new URL(`${base.href}.tsx`),
          new URL(`${base.href}/index.ts`),
          new URL(`${base.href}/index.tsx`),
        ]) {
          if (existsSync(candidate)) return candidate;
        }
        return null;
      };

      const files = [];
      const walkSrc = (dir, prefix = '') => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            if (entry.name !== '__tests__') walkSrc(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`);
            continue;
          }
          if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
            files.push({ path: `${prefix}${entry.name}`, url: new URL(entry.name, dir) });
          }
        }
      };
      walkSrc(srcRoot);

      const edges = new Map();
      for (const file of files) {
        const text = read(file.url).replace(/import\s+type\s+[^;]+;/g, '');
        const targets = [];
        for (const match of text.matchAll(/(?:from|import)\s+'([^']+)'/g)) {
          const target = resolve(match[1], file.url);
          if (target !== null) targets.push(rel(target));
        }
        edges.set(file.path, targets);
      }

      const fixtures = new Set([
        'app/units/fixture-unit-mock.tsx',
        'app/layouts/rightbar/board-mock.ts',
        'app/layouts/rightbar/BoardMockStrip.tsx',
        'app/layouts/rightbar/market-mock.ts',
        'app/layouts/rightbar/market-installed-mock.ts',
        'app/layouts/rightbar/panel-mock.ts',
        'app/layouts/market/add-module-mock.ts',
        'app/layouts/env-gate/gate-mock.ts',
        'app/layouts/rightbar/kit-preview.tsx',
        'app/layouts/rightbar/kit-preview-rows.tsx',
        'app/layouts/rightbar/kit-preview-controls.tsx',
        'app/layouts/rightbar/kit-preview-frame.tsx',
        'shared/hooks/mock-mode.ts',
        'shared/hooks/use-fixture-pick.ts',
        'dev/surface.ts',
        'dev/MockStrip.tsx',
      ]);

      const seen = new Set(['app/client.tsx']);
      const queue = ['app/client.tsx'];
      const reachable = [];
      while (queue.length > 0) {
        const here = queue.shift();
        for (const next of edges.get(here) ?? []) {
          if (seen.has(next)) continue;
          seen.add(next);
          if (fixtures.has(next)) reachable.push(next);
          queue.push(next);
        }
      }
      report(
        '★ 发布图里没有夹具（发布入口的可达图里不许出现夹具模块；夹具只许走 @/dev/surface 接缝）',
        reachable.length === 0,
        reachable.join('、'),
      );
    },
  },
  {
    title: '★ 审批明细座位注册了（priority < 0：single 座位同秩注册会抛）',
    async run(ctx, report) {

      const started = Date.now();
      while (
        ctx.registrations.every((entry) => entry.options.name !== 'sidebar') &&
        Date.now() - started < 1600
      ) {
        await new Promise((resolve) => {
          setTimeout(resolve, 50);
        });
      }

      const { registrations } = ctx;
      ctx.sidebar = registrations.find((r) => r.options.name === 'sidebar');
      ctx.rightbar = registrations.find((r) => r.options.name === 'rightbar');
      ctx.corner = registrations.find((r) => r.options.name === 'conversation.session.header.corner');
      ctx.marketEntry = registrations.find(
        (r) => r.options.name === 'sidebar.panellist' && r.options.id === 'workbench-market',
      );
      ctx.marketPage = registrations.find(
        (r) => r.options.name === 'main' && r.options.key === 'workbench-market',
      );
      ctx.heroSeat = registrations.find((r) => r.options.name === 'conversation.hero.workspace');

      const approval = registrations.find((entry) => entry.options.name === 'conversation.approval.detail');
      const rank = approval?.options.priority;
      report(
        '★ 审批明细座位注册了（priority < 0：single 座位同秩注册会抛）',
        typeof rank === 'number' && rank < 0,
        approval === undefined ? '没注册' : `priority=${String(rank)}`,
      );
    },
  },
  {
    title: 'apply() 注入了一份 <style>：自有前缀 .wb- + board 那份 + 面板列（构建把 CSS 打进来了）',
    run(ctx, report) {
      const { injectedStyles } = ctx;

      report(
        'apply() 注入了一份 <style>：自有前缀 .wb- + board 那份 + 面板列（构建把 CSS 打进来了）',
        injectedStyles.length === 1 &&
          typeof injectedStyles[0]?.textContent === 'string' &&
          injectedStyles[0].textContent.includes('.wb-root') &&
          injectedStyles[0].textContent.includes('.wb-panelRow') &&
          injectedStyles.some((el) => el.textContent.includes('.wb-rightbar')),
      );
    },
  },
  {
    title: '注册进 sidebar 槽并拿到组件，locale 命名空间是 workbench',
    run(ctx, report) {
      const { sidebar } = ctx;

      report(
        '注册进 sidebar 槽并拿到组件，locale 命名空间是 workbench',
        sidebar !== undefined &&
          typeof sidebar?.component === 'function' &&
          sidebar?.options.locale === 'workbench',
      );
    },
  },
  {
    title: '一共就注册这十个槽名，十一条注册（多一条都要想清楚为什么）',
    run(ctx, report) {
      const { registrations } = ctx;

      report(
        '一共就注册这八个槽名，九条注册（多一条都要想清楚为什么）',
        [...new Set(registrations.map((r) => r.options.name))].sort().join(',') ===
          [
            'conversation.session.header.corner',
            'rightbar',
            'sidebar',
            'sidebar.footer.action',
            'sidebar.panellist',
            'sidebar.session.row.hover',
            'sidebar.session.row.leading',
            'main',
            'conversation.approval.detail',
            'settings.section',
          ]
            .sort()
            .join(',') &&
          registrations.length === 11,
        registrations
          .map((r) => `${r.options.name}${r.options.id === undefined ? '' : `#${r.options.id}`}`)
          .join('、'),
      );
    },
  },
  {
    title: '市场注册了左栏入口与主区页面，且 key 同值',
    run(ctx, report) {
      const { marketEntry, marketPage } = ctx;

      report(
        '市场注册了左栏入口与主区页面，且 key 同值',
        marketEntry !== undefined &&
          marketPage !== undefined &&
          marketPage.options.key === marketEntry.options.id,
        String(marketPage?.options.key),
      );
    },
  },
  {
    title: '★ 没有注册 conversation.hero.workspace（遮蔽会做出空菜单）',
    run(ctx, report) {
      const { heroSeat } = ctx;

      report('★ 没有注册 conversation.hero.workspace（遮蔽会做出空菜单）', heroSeat === undefined);
    },
  },
  {
    title: '★ 注入的 CSS 里有隐藏 hero 选择工作区的规则',
    run(ctx, report) {
      const { injectedStyles } = ctx;
      report(
        '★ 注入的 CSS 里有隐藏 hero 选择工作区的规则',
        typeof injectedStyles[0]?.textContent === 'string' &&
          injectedStyles[0].textContent.includes('button[class$=_workspace]'),
      );
    },
  },
  {
    title: '★ 那个类名在**已装的 dsh** 里还在（dsh 一改类名当场红，别等用户看见按钮）',
    run(ctx, report) {

      ctx.dshConversationBundle = (() => {
        const home = process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh');
        const roots = [
          join(dirname(dirname(process.execPath)), 'lib', 'node_modules'),
          join(dirname(dirname(process.execPath)), 'node_modules'),
        ];
        for (const base of [join(home, 'profiles'), join(home, 'workbench')]) {
          if (!existsSync(base)) continue;
          for (const entry of readdirSync(base, { withFileTypes: true })) {
            if (entry.isDirectory()) roots.push(join(base, entry.name, 'node_modules'));
          }
        }
        const tails = [
          join(
            '@deepseek-ai',
            'dsh',
            'node_modules',
            '@deepseek-ai',
            'dsh-client-ui-conversation',
            'lib',
            'client.js',
          ),
          join('@deepseek-ai', 'dsh-client-ui-conversation', 'lib', 'client.js'),
        ];
        for (const root of roots) {
          for (const tail of tails) {
            const candidate = join(root, tail);
            if (existsSync(candidate)) return candidate;
          }
        }
        return undefined;
      })();
      const { dshConversationBundle } = ctx;
      report(
        '★ 那个类名在**已装的 dsh** 里还在（dsh 一改类名当场红，别等用户看见按钮）',
        dshConversationBundle === undefined ||
          /\.[A-Za-z0-9_]+_workspace\{/.test(readFileSync(dshConversationBundle, 'utf8')),
        dshConversationBundle === undefined
          ? '不适用：没找到已装的 dsh（只保住了上面那条"我们的 CSS 里有规则"）'
          : '对过已装 dsh 的 @deepseek-ai/dsh-client-ui-conversation/lib/client.js',
      );
    },
  },
  {
    title: '重新声明了这十个座位',
    run(ctx, report) {
      const { sidebar } = ctx;
      const children = Object.keys(sidebar?.options.children ?? {});
      ctx.children = children;

      const SEATS = [
        'sidebar.brand.mark',
        'sidebar.brand.name',
        'sidebar.toggle.badge',
        'sidebar.panellist',
        'sidebar.settings',
        'sidebar.footer.action',
        'sidebar.workspaces.session.menu.item',
        'sidebar.workspaces.session.row.action',
        'sidebar.session.row.leading',
        'sidebar.session.row.hover',
      ];
      report(
        '重新声明了这十个座位',
        SEATS.every((seat) => children.includes(seat)),
        SEATS.filter((seat) => !children.includes(seat)).join('、') || children.join(','),
      );
    },
  },
  {
    title: '★ 刻意不声明 sidebar.workspaces（自带会话区因此不会挂载）',
    run(ctx, report) {
      const { children } = ctx;
      report(
        '★ 刻意不声明 sidebar.workspaces（自带会话区因此不会挂载）',
        !children.includes('sidebar.workspaces'),
        children.join(','),
      );
    },
  },
  {
    title: '★ 声明了 sidebar.session.row.hover 就必须真渲染它',
    run(ctx, report) {
      const { children } = ctx;

      const sessionRowSource = read(pkg('src/app/layouts/sidebar/SessionList.tsx'));
      report(
        '★ 声明了 sidebar.session.row.hover 就必须真渲染它',
        children.includes('sidebar.session.row.hover') &&
          sessionRowSource.includes("renderSlot('sidebar.session.row.hover'"),
        children.join(','),
      );
    },
  },
  {
    title: 'session.menu.item 带着 hooks 注入面（ui-workspace 靠它关菜单）',
    run(ctx, report) {
      const { sidebar } = ctx;
      report(
        'session.menu.item 带着 hooks 注入面（ui-workspace 靠它关菜单）',
        typeof sidebar?.options.children?.['sidebar.workspaces.session.menu.item']?.inject?.hooks
          ?.menuOpenState === 'function',
      );
    },
  },
  {
    title: '左栏 inject 提供十个能力',
    run(ctx, report) {
      const { sidebar } = ctx;

      ctx.injected =
        typeof sidebar?.options.inject === 'function' ? sidebar.options.inject() : sidebar?.options.inject;
      const { injected } = ctx;
      const SIDEBAR_CAPS = [
        'listPanels',
        'subscribePanels',
        'openWorkspace',
        'createWorkspace',
        'pickDirectory',
        'openSession',
        'startSession',
        'toggleSidebar',
        'selectPanel',
        'renameWorkspace',
      ];
      report(
        '左栏 inject 提供十个能力',
        SIDEBAR_CAPS.every((name) => typeof injected?.[name] === 'function'),
        SIDEBAR_CAPS.filter((name) => typeof injected?.[name] !== 'function').join('、') ||
          SIDEBAR_CAPS.join(','),
      );
    },
  },
  {
    title: 'rightbar 以 priority -1 遮蔽出厂 RightbarRoot、不声明子座位、拿到了组件',
    run(ctx, report) {
      const { rightbar } = ctx;

      report(
        'rightbar 以 priority -1 遮蔽出厂 RightbarRoot、不声明子座位、拿到了组件',
        rightbar !== undefined &&
          rightbar?.options.priority === -1 &&
          rightbar?.options.children === undefined &&
          typeof rightbar?.component === 'function',
        `priority=${String(rightbar?.options.priority)}`,
      );
    },
  },
  {
    title: 'rightbar inject 提供四个能力',
    run(ctx, report) {
      const { rightbar } = ctx;
      const RIGHTBAR_CAPS = ['applyRightbar', 'toggleRightbar', 'openPanel', 'goToPanel'];
      report(
        'rightbar inject 提供四个能力',
        RIGHTBAR_CAPS.every((name) => typeof rightbar?.options.inject?.()?.[name] === 'function'),
        RIGHTBAR_CAPS.filter((name) => typeof rightbar?.options.inject?.()?.[name] !== 'function').join(
          '、',
        ) || RIGHTBAR_CAPS.join(','),
      );
    },
  },
  {
    title: 'rightbar 把状态以 hooks.rightbar 交出去（绑成 useRightbar）',
    run(ctx, report) {
      const { rightbar } = ctx;
      report(
        'rightbar 把状态以 hooks.rightbar 交出去（绑成 useRightbar）',
        typeof rightbar?.options.inject?.()?.hooks?.rightbar?.getSnapshot === 'function',
      );
    },
  },
  {
    title: '★ 切列入口注册进对话头部右上角（与出厂 ExpandButton 同座位）',
    run(ctx, report) {
      const { corner } = ctx;
      report(
        '★ 切列入口注册进对话头部右上角（与出厂 ExpandButton 同座位）',
        corner !== undefined && corner.options.priority === -1,
        String(corner?.options.priority),
      );
    },
  },
  {
    title: '★ 切列入口拿到切列动作、官方那列的开合源，以及与右栏同一份状态',
    run(ctx, report) {
      const { corner, rightbar } = ctx;
      report(
        '★ 切列入口拿到切列动作、官方那列的开合源，以及与右栏同一份状态',
        typeof corner?.options.inject?.()?.selectColumn === 'function' &&
          typeof corner?.options.inject?.()?.dshColumn?.getSnapshot === 'function' &&
          typeof corner?.options.inject?.()?.dshColumn?.subscribe === 'function' &&
          corner?.options.inject?.()?.hooks?.rightbar === rightbar?.options.inject?.()?.hooks?.rightbar,
      );
    },
  },
  {
    title: '★ 右栏开合不做动画（帧的列表 + 出厂面板内容层一起关，我们这份连 transition 都不写）',
    run(ctx, report) {

      const { injectedStyles } = ctx;
      const css = panelCss(injectedStyles);
      const source = rightbarSource();
      const module = panelModule();
      const zeroSlow = /--ds-transition-duration-slow:\s*0s/.test(css);
      const scoped = css.includes('[data-animating]') && css.includes('[data-sidebar-right-panel]');
      const noOwnMotion = !/transition|translateX|animation/.test(module);
      const staysMounted = !/!shown\)\s*return null/.test(source);
      report(
        '★ 右栏开合不做动画（帧的列表 + 出厂面板内容层一起关，我们这份连 transition 都不写）',
        zeroSlow && scoped && noOwnMotion && staysMounted,
        `置 0=${zeroSlow} · 两个作用域=${scoped} · 面板样式无动效=${noOwnMotion} · 收起不卸载=${staysMounted}`,
      );
    },
  },
  {
    title: '★ 面板列自己带层号（推开 10 / 全屏 40，照出厂的 dock 层；对话的浮条盖不住它）',
    run(ctx, report) {

      const source = rightbarSource();
      const module = panelModule();
      report(
        '★ 面板列自己带层号（推开 10 / 全屏 40，照出厂的 dock 层；对话的浮条盖不住它）',
        /--wb-z-10/.test(module) &&
          /--wb-z-40/.test(module) &&
          /\[data-fullscreen\]/.test(module) &&
          /data-fullscreen/.test(source),
        `10=${/--wb-z-10/.test(module)} · 40=${/--wb-z-40/.test(module)} · 全屏档=${/\[data-fullscreen\]/.test(module)}`,
      );
    },
  },
  {
    title: '★ 中区只注册了市场那一页（对话仍是默认页）',
    run(ctx, report) {

      const { registrations } = ctx;
      report(
        '★ 中区只注册了市场那一页（对话仍是默认页）',
        registrations.every((r) => r.options.name !== 'main' || r.options.key === 'workbench-market'),
        registrations.filter((r) => r.options.name === 'main').map((r) => String(r.options.key)).join('、'),
      );
    },
  },
];
