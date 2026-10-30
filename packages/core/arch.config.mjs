import { unitRules } from './arch/rules/units.mjs';
import { kernelRules } from './arch/rules/kernel.mjs';
import { STACK_CAPABILITIES } from '../../scripts/arch/stack.mjs';
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
        'kernel/host': 2,
        'kernel/client': 2,
        'kernel/contract': 2,

        'shared/styles': 0,
        'shared/api': 4,
        'shared/dev-surface': 4,

        'shared/hooks': 4,
        'shared/components': 4,
        'modules/sessions': 5,
        'modules/panels': 5,

        'app/layouts': 6,

        'app/units': 7,

        dev: 9,
      },
    }),

    designSystem({
      styleDir: 'src/shared/styles',
      tokenDir: 'src/shared/styles/tokens',
      paletteFile: 'src/shared/styles/tokens/palette.css',
      staticPrefix: '--wb-static-',
      vendorDir: '',
      themeFile: '',

      externalTokens: [
        { prefix: '--dsw-', provider: '@deepseek-ai/dsh-client-ui-theme' },
        { prefix: '--ds-', provider: '@deepseek-ai/dsh-client-ui-theme' },
        { prefix: '--dsh-', provider: '@deepseek-ai/dsh-client-ui-theme' },
      ],
      externalConsumers: ['../shared/src/**'],

      valueWhitelists: [
        { rule: 'D12', allow: ['0'] },
        { rule: 'D13', allow: ['0'] },
        { rule: 'D14', allow: ['0'] },
      ],
    }),

    deps({
      fingerprints: [{ capability: 'query-string', allowOwn: false }],
      capabilities: STACK_CAPABILITIES,
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
          'src/shared/hooks/market-queries.ts',
          'src/shared/hooks/runtime-queries.ts',
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

          'src/kernel/**',
          'src/shared/api/host/**',
          'src/modules/*/model/**',
        ],
        testGlobs: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/__tests__/**'],

        checkChain: { script: 'check', require: [] },
      },
      coverage: {
        report: 'coverage/coverage-summary.json',

        mustCover: [
          'src/kernel/**',
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


    i18n(noneI18nKit()),
    uiKit(noneKit()),

    styles(cssModulesKit()),
  ],
  overrides: {

    include: ['src/**', 'vitest.setup.ts'],

    addRoles: [{ id: 'core:test-setup', pattern: 'vitest.setup.ts', layer: 99, exclusive: true }],

    customRules: [...unitRules, ...kernelRules],

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
        rule: 'D18',
        glob: 'src/app/layouts/rightbar/ModulesPage.module.css',
        reason:
          '拖拽幽灵的阴影就是 tokens/palette.css 里那条 --wb-static-shadow-ghost 的**唯一**用途 ——' +
          '那份 palette 当初就是为了这个值（以及 darwin 标题栏叠加、mask 端点）才存在的：' +
          'dsh 没有对应令牌，所以它不是"绕过语义令牌"，而是这个值本来就不语义。' +
          '组件样式搬进 .module.css 后（ADR-0029 的 S4）这条豁免跟着搬一次。',
      },
      {
        rule: 'H09',
        glob: 'src/shared/hooks/use-fixture-pick.ts',
        reason:
          '**开发者调试夹具的挑选机制**（只在开发构建里；选中哪一条 + "再点一次也重挂"的计数），' +
          '**不含任何夹具数据** —— 场景表在各模块的 `fixtures.ts` / `*-mock.ts` 里。命名带 fixture ' +
          '是因为它就是干这个的（本仓的词汇是"夹具"，改名成别的只会让读的人对不上号）；落点在 ' +
          '`shared/hooks`，只有当 URL 带 `wbMock=1` 时才真的接管选择，且不碰机器上的任何东西。' +
          '这批文件只经 `@/shared/dev-surface/install` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）' +
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
          '（M4 / M10 / M11 / M12 / M13）。这批文件只经 `@/shared/dev-surface/install` 接缝被引用，发布构建' +
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
          '写在同目录的 __tests__/add-module-mock.test.ts。这批文件只经 `@/shared/dev-surface/install` 接缝被引用，' +
          '发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。',
      },
      {
        rule: 'H09',
        glob: 'src/app/layouts/env-gate/*-mock.ts',
        reason:
          '**开发者调试夹具**（只在开发构建里有）：启动页（环境 gate）的状态快照。真机上这一屏一闪' +
          '就没了（就绪即撤），安装态与失败态要真把 opencli 卸掉才看得到 —— 所以夹具把宿主给的快照' +
          '**钉住**：不轮询、不放行。只有当 URL 带 `wbMock=1` 时才参与，且不碰机器上的任何东西。' +
          '这批文件只经 `@/shared/dev-surface/install` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）' +
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
          '这批文件只经 `@/shared/dev-surface/install` 接缝被引用，发布构建（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）' +
          '把它们整棵排除 ⇒ **发布产物里没有它们**。',
      },
      {
        rule: 'H09',
        glob: 'src/shared/hooks/mock-mode.ts',
        reason:
          '**开发者调试夹具**（只在开发构建里有）：浮层两页、缺陷卡片的场景表、看板内容区的形状表、' +
          '以及夹具总开关。它们按约定落在这几处、命名带 mock：只有当 URL 带 `wbMock=1`（老名字 ' +
          '`wbMarketMock=1` 也认）时才参与渲染，且夹具模式下**不装卸机器上的东西、不改真配置、' +
          '不打真平台**。落点与开关写进 内部设计记录' +
          '（M4 / M10 / M11 / M12 / M13）。这批文件只经 `@/shared/dev-surface/install` 接缝被引用，发布构建' +
          '（`WB_RELEASE=1` → `src/dev/surface.stub.ts`）把它们整棵排除 ⇒ **发布产物里没有它们**。',
      },
      {
        rule: 'D05',
        glob: 'src/shared/styles/tokens/scale.css',
        reason:
          '这是本仓的**模块面令牌 API**：module-facing 的 --wb-* 由仓库之外的模块包消费，' +
          '本仓里天然没有引用者（selfcheck 的「跨包令牌账：定义的 --wb-* 都有人用」把这几条列为在册）。' +
          '包内的跨包消费者（packages/shared 的组件样式）已由 designSystem.externalConsumers 计入，' +
          '不再需要按整份文件静音；这条只兜「定义在本仓、消费者在仓外」的公开令牌面。',
      },
      {
        rule: 'P06',
        glob: 'src/modules/panels/model/diy-record.ts',
        reason:
          '这条判定命中的是**注入子进程的那段脚本字符串**里的 `process.argv[1]` —— 那是子脚本自己的入参，' +
          '不是外壳在解析命令行（外壳的 argv 只在 bin 里读）。脚本以字符串形式随宿主下发，行内正则分不清。',
      },
    ],
  },
};
