import { readFileSync } from 'node:fs';
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
import { createRule } from '@arch-guard/core';
import { DECLARED_TOOLS_FILE } from './declared-tools.mjs';
import { SEED_SPECIFIERS } from './seed.mjs';

const HOST_FACE = 'src/host.ts';
const CLIENT_FACE = 'src/client.tsx';

const LAYERS = { model: 1, components: 2, host: 10 };

const MESSAGES_ROLE = { id: 'lib:messages', pattern: 'src/messages.ts', layer: 1 };

const DECLARED_TOOLS_ROLE = { id: 'lib:declared-tools', pattern: DECLARED_TOOLS_FILE, layer: 1 };

const DEFAULT_THRESHOLDS = { fileLines: 200, viewLines: 200, functionLines: 80 };

const TESTS_DIR_ROLE = {
  id: 'lib:tests-dir',
  pattern: 'src/**/__tests__/**',
  layer: 99,
  exclusive: true,
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
  externalTokens: [
    { prefix: '--dsw-', provider: '@deepseek-ai/dsh-client-ui-theme' },
    { prefix: '--ds-', provider: '@deepseek-ai/dsh-client-ui-theme' },
    { prefix: '--wb-', provider: '@dsh-workbench/core' },
  ],
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

const MODEL_FILE = /^src\/(model\/|messages\.ts$)/;
const MODEL_BANNED = [
  /^react(?:\/|$)/,
  /^react-dom(?:\/|$)/,
  /^@deepseek-ai\//,
  /^@dsh-workbench\/core(?:\/client)?$/,
  /^@dsh-workbench\/shared\/host$/,
  /^node:/,
  /^opencli(?:\/|$)/,
  /^@\/components(?:\/|$)/,
  /^(?:\.\.?\/)+(?:components|host|client)(?:\/|$)/,
  /^(?:@\/|\.\.?\/)(?:host|client)$/,
];

const COMPONENT_FILE = /^src\/components\//;
const COMPONENT_BANNED = [
  /^@dsh-workbench\/shared\/host$/,
  /^@dsh-workbench\/core$/,
  /^node:/,
  /^opencli(?:\/|$)/,
  /^(?:\.\.?\/)+(?:host|client)$/,
  /^(?:@\/)(?:host|client)$/,
];

const modelStaysPure = createRule({
  id: 'S71',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '模块核心（model / messages）不碰宿主、UI 与运行时',
  hint:
    'model / messages 是模块里最底的一层：只放纯逻辑、状态机、文案。' +
    'React、kit、dsh、opencli、node:*、组件与两个面都不许 import；要用类型就从 core/contract 取 import type。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      if (!MODEL_FILE.test(record.rel)) continue;
      for (const fact of ctx.facts.get(record.rel)?.imports ?? []) {
        if (fact.typeOnly) continue;
        if (!MODEL_BANNED.some((pattern) => pattern.test(fact.spec))) continue;
        findings.push({
          rule: 'S71',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `模块核心 import 了 ${fact.spec}`,
          hint: '把宿主 / UI / 运行时的依赖推到 components 或两个面；核心只依赖纯类型与纯函数',
        });
      }
    }
    return findings;
  },
});

const componentsStayBrowser = createRule({
  id: 'S72',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '模块视图不碰宿主面',
  hint:
    'components 只消费 props：可以拿 kit 与纯数据，不许 import 宿主入口、shared/host、dsh 原语或 node:*。' +
    '取数、写、路由都在两个面与 model 里。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      if (!COMPONENT_FILE.test(record.rel)) continue;
      for (const fact of ctx.facts.get(record.rel)?.imports ?? []) {
        if (fact.typeOnly) continue;
        if (!COMPONENT_BANNED.some((pattern) => pattern.test(fact.spec))) continue;
        findings.push({
          rule: 'S72',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `模块视图 import 了 ${fact.spec}`,
          hint: '组件只接收数据与回调；宿主侧能力放 src/host.ts，浏览器侧取数放面的 hooks',
        });
      }
    }
    return findings;
  },
});

const LOCAL_PROTOCOL =
  /\b(?:interface|type)\s+(UnitModuleFace|UnitMountResult|UnitClientFace|UnitClientApi|UnitModuleRegistry|UnitClientRegistry|UnitRegistry|HostContext|ClientContext|BoardProps)\b/g;

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

const protocolsStayCanonical = createRule({
  id: 'S73',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '模块不本地重声明外壳协议',
  hint:
    '协议类型只有一份：`@dsh-workbench/core/contract`。删掉本地 interface / type，改成 `import type`；' +
    '本地重声明会让外壳升级时模块静默对不上。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      const text = readFileSync(record.abs, 'utf8');
      for (const match of text.matchAll(LOCAL_PROTOCOL)) {
        findings.push({
          rule: 'S73',
          file: record.rel,
          line: lineOf(text, match.index),
          text: `本地声明 ${match[1]}`,
          hint: '删掉，改 import type from @dsh-workbench/core/contract',
        });
      }
    }
    return findings;
  },
});

const MODULE_RULES = [modelStaysPure, componentsStayBrowser, protocolsStayCanonical];

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
      customRules: MODULE_RULES,

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
      exceptions: [...exceptions],
    },
  };
}
