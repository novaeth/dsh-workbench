import { unitRules } from './arch/rules/units.mjs';
import {
  callSites,
  cssModulesKit,
  designSystem,
  deps,
  hygiene,
  i18n,
  library,
  metrics,
  noneI18nKit,
  noneKit,
  styles,
  uiKit,
} from '@arch-guard/core/presets';

export default {

  sourceForm: 'react',
  presets: [
    library({
      src: 'src',
      entry: ['app/host.ts', 'app/client.tsx'],

      modules: {
        'shared/styles': 0,
        'shared/api': 4,

        'shared/hooks': 7,
        'shared/components': 8,
        'modules/sessions': 10,
        'modules/panels': 10,

        'app/layouts': 10,

        'app/units': 10,

        dev: 10,
      },
    }),

    designSystem({
      styleDir: 'src/shared/styles',
      tokenDir: 'src/shared/styles/tokens',
      paletteFile: 'src/shared/styles/tokens/palette.css',
      staticPrefix: '--wb-static-',
      vendorDir: 'src/shared/styles/vendor',
      themeFile: '',

      valueWhitelists: [
        { rule: 'D12', allow: ['0'] },
        { rule: 'D13', allow: ['0'] },
        { rule: 'D14', allow: ['0'] },
      ],
    }),

    deps({
      allow: [
        'react',
        '@dsh-workbench/shared',
        'execa',
        'which',
        'proper-lockfile',
        'write-file-atomic',
        'dayjs',
        'prompts',
        'zod',
      ],
      fingerprints: [{ capability: 'query-string', allowOwn: false }],
      deny: ['shell-quote', 'shelljs', 'zx'],

      capabilities: {
        'unique-id': 'crypto.randomUUID',
        'number-format': 'Intl.NumberFormat',
        'deep-equal': 'node:util.isDeepStrictEqual',

        datetime: 'dayjs',
        'deep-clone': 'structuredClone',
        'query-string': 'URLSearchParams',
        validation: 'zod',
      },
    }),

    callSites([

      {
        name: '事实读路径（apiGet）',
        apis: ['apiGet'],
        in: [
          'src/shared/hooks/fact-transports.ts',
          'src/shared/hooks/use-api-resource.ts',

          'src/shared/hooks/use-capabilities.ts',

          'src/shared/hooks/sidebar-edition.ts',
          'src/app/layouts/rightbar/use-panels.ts',

          'src/app/units/manifests.ts',

          'src/shared/hooks/bundle-queries.ts',
        ],
      },

      {
        name: '写通道（apiPost）',
        apis: ['apiPost'],
        in: ['src/shared/hooks/use-host-write.ts', 'src/shared/hooks/panel-state-report.ts'],
      },

      {
        name: '变更流（EventSource）',
        apis: ['EventSource'],
        in: ['src/shared/hooks/fact-transports.ts'],
      },
    ]),

    hygiene(),

    metrics({
      tests: {
        requireTestsFor: [

          'src/shared/api/host/**',
          'src/modules/*/model/**',
        ],
        testGlobs: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/__tests__/**'],

        checkChain: { script: 'check', require: [] },
      },
      coverage: {
        report: 'coverage/coverage-summary.json',

        mustCover: [
          'src/shared/api/**',
          'src/modules/*/model/**',
        ],

        ratchet: true,
        baselineFile: 'coverage/baseline.json',

        zeroAllow: [
          {
            file: 'src/dev/surface.stub.ts',
            reason: '发布构件才被 alias 换进来的空实现（几行常量）；vitest 走的是真实现 surface.ts。',
          },
          {
            file: 'src/dev/MockStrip.tsx',
            reason: '夹具条（开发件）：只有 ?wbMock=1 下才渲染，测试不挂它；观感由开发构建实测。',
          },
        ],
      },
    }),

    { enable: ['S60', 'S62', 'S63', 'S64', 'S65', 'S66', 'S67', 'S68', 'D31'] },

    i18n(noneI18nKit()),
    uiKit(noneKit()),

    styles(cssModulesKit()),
  ],
  overrides: {

    include: ['src/**'],

    customRules: unitRules,

    structure: {
      runtimes: [
        { name: 'host', entries: ['src/app/host.ts'] },
        { name: 'client', entries: ['src/app/client.tsx'] },
      ],

      faces: [
        { pattern: 'src/modules/panels/index.ts', runtime: 'host', value: '*Host' },
      ],
    },
    ignore: [

      'dist/**',
      'node_modules/**',
      '.verify/**',
      'scripts/**',
      'bin/**',
      'arch.config.mjs',
    ],
    exceptions: [
      {
        rule: 'D04',
        glob: 'src/shared/styles/**',
        reason:
          '主题令牌由 dsh 在运行时提供（--dsw-*，见 @deepseek-ai/dsh-client-ui-theme）。' +
          '本仓**不拥有主题**：tokens/palette.css 只兜 dsh 没有对应令牌的那几个静态值（名字一律 --wb-static-*），' +
          '凡是 --dsw-* 的**名字**都不在本仓定义 —— 所以这里的引用查不闭合是正常的、也是唯一一处例外。' +
          'dsh 改名会由它的版本升级暴露，而不是由本仓的本地表兜住。',
      },
      {
        rule: 'D04',
        glob: '**/*.module.css',
        reason:
          '同上：组件样式（ADR-0029 的 S4）写在自己的 `.module.css` 里，但颜色/圆角/字号/间距' +
          '用的仍是 dsh 的运行时令牌（--dsw-*）—— 组件样式与全局样式表是同一个理由，' +
          '只是落点从"声明过的样式目录"变成了"组件旁边"。',
      },
      {
        rule: 'D18',
        glob: 'src/app/layouts/rightbar/ModulesPage.module.css',
        reason:
          '拖拽幽灵的阴影就是 tokens/palette.css 里那条 --wb-static-shadow-ghost 的**唯一**用途 ——' +
          '那份 palette 当初就是为了这个值（以及 darwin 标题栏叠加、mask 端点）才存在的：' +
          'dsh 没有对应令牌，所以它不是"绕过语义令牌"，而是这个值本来就不语义。' +
          '组件样式搬进 .module.css 后（ADR-0029 的 S4）这条豁免跟着搬一次。',
      },
      {
        rule: 'D05',
        glob: 'src/shared/styles/tokens/scale.css',
        reason:
          '令牌**定义**住在本包、而它的**消费者**在 S3 之后有一半住在 packages/shared（组件自带样式）。' +
          'arch 只看一个包，于是 ResourceStates 在用的 --wb-dur-1-4 / --wb-len-13 / --wb-len-300 这些' +
          '会被报成"没人用"（实测 5 条误报）。跨包的令牌账由 selfcheck 的两条判据按**整个 workspace** 算：' +
          '「★ 令牌账（跨包）：引用的 --wb-* 都有定义」与「…定义的 --wb-* 都有人用」—— 视野比这条宽，' +
          '所以这里豁免掉不会漏掉真死令牌。',
      },
      {
        rule: 'H09',
        glob: 'src/shared/hooks/use-fixture-pick.ts',
        reason:
          '**开发者调试夹具的挑选机制**（只在开发构建里；选中哪一条 + "再点一次也重挂"的计数），' +
          '**不含任何夹具数据** —— 场景表在各模块的 `fixtures.ts` / `*-mock.ts` 里。命名带 fixture ' +
          '是因为它就是干这个的（本仓的词汇是"夹具"，改名成别的只会让读的人对不上号）；落点在 ' +
          '`shared/hooks`，只有当 URL 带 `wbMock=1` 时才真的接管选择，且不碰机器上的任何东西。' +
          '这批文件只经 `@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）' +
          '把它们整棵排除 ⇒ **发布产物里没有它们**。',
      },
      {
        rule: 'H09',
        glob: 'src/app/layouts/rightbar/*-mock.ts',
        reason:
          '**开发者调试夹具**（只在开发构建里有）：浮层两页、缺陷卡片的场景表、看板内容区的形状表、' +
          '以及夹具总开关。它们按约定落在这几处、命名带 mock：只有当 URL 带 `wbMock=1`（老名字 ' +
          '`wbMarketMock=1` 也认）时才参与渲染，且夹具模式下**不装卸机器上的东西、不改真配置、' +
          '不打真平台**。落点与开关写进 内部设计记录' +
          '（M4 / M10 / M11 / M12 / M13）。这批文件只经 `@/dev/surface` 接缝被引用，发布构建' +
          '（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。',
      },
      {
        rule: 'H09',
        glob: 'src/app/layouts/rightbar/market-mock-types.ts',
        reason:
          '**只有夹具的形状**（`MarketMock` / `MarketMockExpect`），**不含任何夹具数据、也不参与渲染**。' +
          '单拎出来是因为三份场景表（总表 / 已装那一族的表 / 将来再加的表）与视图都要读它，' +
          '放回任何一份里都会跟那一份形成依赖环（S08 实测）。命名跟着本仓词汇（"夹具" = mock）走。',
      },
      {
        rule: 'H09',
        glob: 'src/app/layouts/market/*-mock.ts',
        reason:
          '**开发者调试夹具**（只在开发构建里有）：添加模块浮层的每一屏（预检拒因、装中可取消、' +
          '脚本待批、要重启、非工作台模块…）。这些状态真机上要么要卸真东西、要么要等真网络才看得到。' +
          '命名带 mock、与浮层同目录：只有当 URL 带 `wbMock=1` 时才出现，且 `stateOfMock` 把动作' +
          '全换成空的 —— **不装卸机器上的东西**。夹具喂真函数断言（键在不在字典里、状态机自不自洽）' +
          '写在同目录的 __tests__/add-module-mock.test.ts。这批文件只经 `@/dev/surface` 接缝被引用，' +
          '发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。',
      },
      {
        rule: 'H09',
        glob: 'src/app/layouts/env-gate/*-mock.ts',
        reason:
          '**开发者调试夹具**（只在开发构建里有）：启动页（环境 gate）的状态快照。真机上这一屏一闪' +
          '就没了（就绪即撤），安装态与失败态要真把 opencli 卸掉才看得到 —— 所以夹具把宿主给的快照' +
          '**钉住**：不轮询、不放行。只有当 URL 带 `wbMock=1` 时才参与，且不碰机器上的任何东西。' +
          '这批文件只经 `@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）' +
          '把它们整棵排除 ⇒ **发布产物里没有它们**。',
      },
      {
        rule: 'H09',
        glob: 'src/app/units/*-mock.tsx',
        reason:
          '**开发者调试夹具的模板单元**（只在开发构建里有）：真花名册里没有带卡片的模块时（干净 ' +
          'profile 一个模块都没装），三张场景表拿它当模板 —— 市场 24 屏 / 看板 6 条 / 卡片 12 条才有得看；' +
          '真装了模块就用真模块，所以夹具上显示的名字始终是你自己那套。它**不进注册表**' +
          '（`units.manifests()` 永远只说真装了什么），只在 `?wbMock=1` 时被场景表取用，且不碰机器上的' +
          '任何东西。落点与开关写进 内部设计记录（M16）。' +
          '这批文件只经 `@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）' +
          '把它们整棵排除 ⇒ **发布产物里没有它们**。',
      },
      {
        rule: 'S66',
        glob: 'src/app/layouts/env-gate/gate-mock.ts',
        reason:
          '**开发者调试夹具照抄 opencli 的报告原文**（只在开发构建里有；`doctor` 的输出）—— 里面那个 ' +
          '`Issues:` 是 CLI 自己的分节标题（"问题"的意思），不是我们的套件 id。特意照抄而不是改编：' +
          '这份夹具要能回答"界面拿到真报告时是什么样"，把 CLI 的原文改写掉就白验了。这批文件只经 ' +
          '`@/dev/surface` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们' +
          '整棵排除 ⇒ **发布产物里没有它们**。',
      },
      {
        rule: 'H09',
        glob: 'src/shared/hooks/mock-mode.ts',
        reason:
          '**开发者调试夹具**（只在开发构建里有）：浮层两页、缺陷卡片的场景表、看板内容区的形状表、' +
          '以及夹具总开关。它们按约定落在这几处、命名带 mock：只有当 URL 带 `wbMock=1`（老名字 ' +
          '`wbMarketMock=1` 也认）时才参与渲染，且夹具模式下**不装卸机器上的东西、不改真配置、' +
          '不打真平台**。落点与开关写进 内部设计记录' +
          '（M4 / M10 / M11 / M12 / M13）。这批文件只经 `@/dev/surface` 接缝被引用，发布构建' +
          '（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。',
      },
    ],
  },
};
