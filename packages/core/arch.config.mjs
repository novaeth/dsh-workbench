import { unitRules } from './arch/rules/units.mjs';
import { kernelRules } from './arch/rules/kernel.mjs';
import { stackDeps } from '../../scripts/arch/stack.mjs';
import { testsLiveInFolders } from '../../scripts/arch/rules/tests-in-folders.mjs';
import {
  callSites,
  cssModulesKit,
  designSystem,
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

        'shared/hooks': 4,
        'shared/components': 4,
        'modules/sessions': 5,
        'modules/panels': 5,

        'app/layouts': 6,

        'app/units': 7,

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

    stackDeps(),

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

        zeroAllow: [],
      },
    }),


    i18n(noneI18nKit()),
    uiKit(noneKit()),

    styles(cssModulesKit()),
  ],
  overrides: {

    include: ['src/**', 'vitest.setup.ts'],

    addRoles: [{ id: 'core:test-setup', pattern: 'vitest.setup.ts', layer: 99, exclusive: true }],

    customRules: [...unitRules, ...kernelRules, testsLiveInFolders],

    structure: {
      directoryItemLimits: [{ role: 'lib:shared/hooks', max: 32 }],
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
        rule: 'D05',
        glob: 'src/shared/styles/tokens/scale.css',
        reason:
          '这是本仓的**模块面令牌 API**：module-facing 的 --wb-* 由仓库之外的模块包消费，' +
          '本仓里天然没有引用者（selfcheck 的「跨包令牌账：定义的 --wb-* 都有人用」把这几条列为在册）。' +
          '包内的跨包消费者（packages/shared 的组件样式）已由 designSystem.externalConsumers 计入，' +
          '不再需要按整份文件静音；这条只兜「定义在本仓、消费者在仓外」的公开令牌面。',
      },
    ],
  },
};
