import {
  cssModulesKit,
  deps,
  designSystem,
  hygiene,
  i18n,
  library,
  metrics,
  noneI18nKit,
  styles,
} from '@arch-guard/core/presets';
import { DECLARED_TOOLS_FILE } from './declared-tools.mjs';
import { SEED_SPECIFIERS } from './seed.mjs';

const HOST_FACE = 'src/host.ts';
const CLIENT_FACE = 'src/client.tsx';

const LAYERS = { model: 1, components: 2 };

const MESSAGES_ROLE = { id: 'lib:messages', pattern: 'src/messages.ts', layer: 1 };

const DECLARED_TOOLS_ROLE = { id: 'lib:declared-tools', pattern: DECLARED_TOOLS_FILE, layer: 1 };

const DEFAULT_THRESHOLDS = { fileLines: 200, viewLines: 200, functionLines: 80 };

const TEST_LINES_REASON =
  '测试文件是脚手架，不是产品代码：夹具、逐条断言、一条用例十来行，200 行这个阈值对它是错的口径；' +
  '按它拆文件只会把测试脚手架摞进 src/ 的层里（作者反馈：一个模块被逼出过 src/host/testing.ts）。' +
  '测试在方言里本来就有一条排他角色（layer 99，S21 跳过它），这条豁免与那条同一个理由。' +
  '要形状与体积上的约束，请写进模块自己的测试（用例数、覆盖的行为），不要用文件行数卡它。';

const TEST_LINES_EXCEPTIONS = [
  { rule: 'S16', glob: '**/*.{test,spec}.{ts,tsx,mts,cts,js,mjs,cjs}', reason: TEST_LINES_REASON },

  { rule: 'S16', glob: 'src/**/__tests__/**', reason: TEST_LINES_REASON },
];

const TESTS_DIR_ROLE = {
  id: 'lib:tests-dir',
  pattern: 'src/**/__tests__/**',
  layer: 99,
  exclusive: true,
};

const STYLE_EXCEPTION = {
  rule: 'D04',
  glob: 'src/components/**',
  reason:
    '主题令牌由 dsh 在运行时提供（--dsw-*）：模块包**不拥有**令牌表，声明一份自己的' +
    '就是编造一处不存在的真相。所以组件样式里引用的 --dsw-* 在本地查不闭合是正常的；' +
    'dsh 改名会由外壳升级暴露，而不是由模块本地的表兜住。',
};

const SEED_PACKAGES = [
  ...new Set(
    SEED_SPECIFIERS.map((name) => (name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0])),
  ),
];
const ALLOWED_DEPS = [
  ...new Set([
    ...SEED_PACKAGES,
    '@dsh-workbench/core',
    '@dsh-workbench/shared',
    'execa',
    'which',
    'proper-lockfile',
    'write-file-atomic',
    'dayjs',
    'zod',
  ]),
];

const DESIGN = {
  styleDir: 'src/components',
  tokenDir: '',
  paletteFile: '',
  vendorDir: 'src/components/vendor',
  themeFile: '',
  valueWhitelists: [
    { rule: 'D12', allow: ['0'] },
    { rule: 'D13', allow: ['0'] },
    { rule: 'D14', allow: ['0'] },
  ],
};

export function moduleArch(options = {}) {
  const {
    fileLines,
    viewLines,
    functionLines,
    deps: extraDeps = [],
    roles = [],
    layers = {},
    structure,
    exceptions = [],
  } = options;

  const thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...(fileLines === undefined ? {} : { fileLines }),
    ...(viewLines === undefined ? {} : { viewLines }),
    ...(functionLines === undefined ? {} : { functionLines }),
  };

  return {
    sourceForm: 'react',
    presets: [

      library({ src: 'src', entry: ['host.ts', 'client.tsx'], modules: { ...LAYERS, ...layers } }),

      deps({
        allow: [...ALLOWED_DEPS, ...extraDeps],
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
        fingerprints: [{ capability: 'query-string', allowOwn: false }],
      }),

      designSystem({ ...DESIGN }),

      styles(cssModulesKit()),

      hygiene(),

      i18n(noneI18nKit()),

      metrics({
        tests: {
          requireTestsFor: ['src/model/**'],
          testGlobs: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/__tests__/**'],
          checkChain: { script: 'check', require: [] },
        },
      }),
    ],
    overrides: {
      include: ['src/**'],
      addRoles: [MESSAGES_ROLE, DECLARED_TOOLS_ROLE, TESTS_DIR_ROLE, ...roles],
      thresholds,

      structure: structure ?? {
        runtimes: [
          { name: 'host', entries: [HOST_FACE] },
          { name: 'client', entries: [CLIENT_FACE] },
        ],
        faces: [
          { pattern: HOST_FACE, runtime: 'host' },
          { pattern: CLIENT_FACE, runtime: 'client' },

          { pattern: 'src/components/**', runtime: 'client' },
        ],
      },
      exceptions: [STYLE_EXCEPTION, ...TEST_LINES_EXCEPTIONS, ...exceptions],
    },
  };
}
