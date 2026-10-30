import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export const FINGERPRINT = 'dsh-wb/module-lint';

const OPTION_BLOCK_NAMES = new Set([`${FINGERPRINT}/overrides`, `${FINGERPRINT}/root`]);

export function isGlobalIgnoresBlock(block) {
  return (
    block !== null &&
    typeof block === 'object' &&
    Array.isArray(block.ignores) &&
    block.files === undefined &&
    block.rules === undefined
  );
}

function sortedDeep(value) {
  if (Array.isArray(value)) return value.map(sortedDeep);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedDeep(value[key])]),
  );
}

export function dialectShapeOf(block) {
  return {
    name: block.name,
    files: block.files ?? null,
    rules: sortedDeep(block.rules ?? {}),
  };
}

const DEFAULT_IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/client.js',
  '**/*.d.ts',
  '**/components/vendor/**',
];

const COLOR_LITERAL = {
  selector:
    'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/], Literal[value=/^(?:rgba?|hsla?)\\(/]',
  message: '颜色字面量：引用 dsh 的 --dsw-* 令牌，别写死颜色',
};
const BANG_IMPORTANT = {
  selector: 'Literal[value=/!important/]',
  message: '!important：只许在 src/components/vendor/** 里覆盖第三方样式',
};
const PLATFORM_READ = {
  selector:
    "MemberExpression[object.name='process'][property.name='platform'], " +
    "MemberExpression[object.object.name='process'][object.property.name='versions'][property.name='electron'], " +
    "MemberExpression[object.name='window'][property.name='dshDesktop'], " +
    "MemberExpression[object.name='navigator'][property.name='userAgent']",
  message:
    '平台/外壳差异走能力面：宿主面读 deps.surface（HostSurface），浏览器面读 kit.hooks.usePlatform()；' +
    '模块源码不直接读 process.platform / versions.electron / dshDesktop / navigator.userAgent',
};

const NODE_GLOBALS = {
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  module: 'readonly',
  process: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

const SCRIPT_RULES = {
  'no-template-curly-in-string': 'error',
  'require-atomic-updates': ['error', { allowProperties: true }],
  'no-promise-executor-return': 'error',
  'no-async-promise-executor': 'error',
  'no-throw-literal': 'error',
  'no-useless-catch': 'error',
  'no-constant-binary-expression': 'error',
  'no-unmodified-loop-condition': 'error',
  'no-self-compare': 'error',
  'no-sequences': 'error',
  'no-var': 'error',
  eqeqeq: ['error', 'smart'],
};

const SRC_FILES = ['src/**/*.{ts,tsx}'];
const TSX_FILES = ['**/*.tsx'];
const TS_FILES = ['**/*.{ts,tsx}'];

const SCRIPT_FILES = ['scripts/**/*.{js,mjs,cjs}', '*.config.{js,mjs,cjs}'];

export function moduleLint(options = {}) {
  const { ignores = [], rules = {}, rootDir } = options;
  const overrideRules = Object.keys(rules).length === 0 ? [] : [{ name: 'dsh-wb/module-lint/overrides', rules }];

  const rootBlock =
    rootDir === undefined
      ? []
      : [
          {
            name: 'dsh-wb/module-lint/root',
            languageOptions: { parserOptions: { tsconfigRootDir: rootDir } },
          },
        ];

  return [

    { ignores: [...DEFAULT_IGNORES, ...ignores] },
    ...rootBlock,

    js.configs.recommended,

    ...tseslint.configs.recommended,
    {
      name: FINGERPRINT,
      files: SRC_FILES,
      rules: {

        'no-empty': ['error', { allowEmptyCatch: true }],
        'prefer-const': 'error',

        '@typescript-eslint/no-explicit-any': 'error',

        '@typescript-eslint/no-unused-vars': [
          'error',
          { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
        ],

        'no-console': ['error', { allow: ['warn', 'error'] }],
        'no-debugger': 'error',

        'no-restricted-syntax': ['error', COLOR_LITERAL, BANG_IMPORTANT, PLATFORM_READ],
      },
    },
    {
      name: 'dsh-wb/module-lint/react',
      files: TSX_FILES,
      plugins: { react },

      settings: { react: { version: '19.3.0', pragma: 'h', fragment: 'Fragment' } },
      rules: {
        'react/jsx-key': 'error',
        'react/jsx-no-duplicate-props': 'error',
        'react/jsx-no-target-blank': 'error',
        'react/no-children-prop': 'error',
        'react/no-unknown-property': 'error',
        'react/jsx-no-comment-textnodes': 'error',
        'react/jsx-uses-vars': 'error',
        'react/jsx-uses-react': 'error',
      },
    },
    {
      name: 'dsh-wb/module-lint/react-hooks',
      files: TS_FILES,
      plugins: { 'react-hooks': reactHooks },
      rules: {

        ...Object.fromEntries(Object.keys(reactHooks.configs.recommended.rules).map((rule) => [rule, 'warn'])),
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/refs': 'error',
        'react-hooks/exhaustive-deps': 'error',
        'react-hooks/immutability': 'error',
      },
    },
    {
      name: 'dsh-wb/module-lint/scripts',
      files: SCRIPT_FILES,
      languageOptions: { globals: NODE_GLOBALS },
      rules: SCRIPT_RULES,
    },
    ...overrideRules,
  ];
}

export const DIALECT_BLOCKS = moduleLint()
  .filter((block) => !isGlobalIgnoresBlock(block))
  .filter((block) => !(typeof block?.name === 'string' && OPTION_BLOCK_NAMES.has(block.name)))
  .map(dialectShapeOf);

export const DIALECT_IGNORES = [...DEFAULT_IGNORES];
