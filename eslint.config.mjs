import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const KERNEL_BANS = [
  {
    group: [
      '@/app/*',
      '@/modules/*',
      '@/shared/hooks/*',
      '@/shared/components/*',
      '@/shared/styles/*',
      '@/shared/api/host/*',
      '@/adapters/*',
      '@/dev/*',
      '@deepseek-ai/*',
      'react',
      'react-dom',
    ],
    message: '内核只依赖契约与端口；UI、外壳、套件、适配器与 DSH 原语放上层。',
  },
];

const KERNEL_HOST_BANS = [
  ...KERNEL_BANS,
  {
    group: ['@/kernel/client/*', '../client/*', '../../client/*'],
    message: '内核 host 侧不许 import client 侧；共享形状抬到 kernel/contract 或 shared 契约。',
  },
];

const CONTRACT_BANS = [
  {
    group: ['react', 'react-dom', '@deepseek-ai/*', 'node:*', '@/shared/*', '@/app/*', '@/modules/*', 'opencli*'],
    message: 'contract 只放类型与纯数据；UI、宿主实现、Node 与 DSH 原语放上层。',
  },
];

const ADAPTER_BANS = [
  {
    group: ['@/app/*', '@/modules/*', '@/shell/*', '@/units/*', '@/shared/components/*', '@/shared/hooks/*', '@/shared/styles/*'],
    message: '适配器只依赖契约与端口；界面、外壳、套件与样式放上层。',
  },
];

const KERNEL_CLIENT_BANS = [
  ...KERNEL_BANS,
  {
    group: ['@/kernel/host/*', '../host/*', '../../host/*', '@dsh-workbench/shared/host', 'node:*'],
    message: '内核 client 侧不许 import host 侧或 Node 能力；共享形状抬到 kernel/contract 或 shared 契约。',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/site-dist/**',
      '**/coverage/**',
      '**/client.js',
      '**/client.body.js',
      '**/*.d.ts',
      '**/test/golden/**',
      '.scratch/**',
      'private-docs/**',
      '.worktrees/**',
      '.agents/worktrees/**',
    ],
  },

  {
    languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['packages/shared/src/contract/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: CONTRACT_BANS }],
    },
  },
  {
    files: ['packages/core/src/adapters/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ADAPTER_BANS }],
    },
  },
  {
    files: ['packages/core/src/kernel/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: KERNEL_BANS }],
    },
  },
  {
    files: ['packages/core/src/kernel/host/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: KERNEL_HOST_BANS }],
    },
  },
  {
    files: ['packages/core/src/kernel/client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: KERNEL_CLIENT_BANS }],
    },
  },
  {
    files: ['**/*.tsx'],
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
    files: ['**/*.{ts,tsx}'],
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
    files: [
      'packages/core/src/shared/hooks/use-api-resource.ts',
      'packages/core/src/shared/hooks/use-capabilities.ts',
      'packages/core/src/shared/hooks/use-unit-board.ts',
      'packages/core/src/shared/hooks/use-visible-busy.ts',
      'packages/core/src/app/layouts/rightbar/use-panels.ts',
    ],
    rules: { 'react-hooks/immutability': 'off' },
  },

  {
    files: ['packages/core/src/shared/api/host/__tests__/preflight-warm.test.ts'],
    rules: { 'prefer-const': 'off' },
  },
  {
    files: ['packages/shared/src/lib/react.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.{js,mjs}'],
    ignores: ['packages/docs/site/**'],
    languageOptions: { globals: { ...globals.nodeBuiltin } },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['packages/docs/site/**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.browser } },
  },

  {
    files: [
      'scripts/**/*.{js,mjs,cjs}',
      'packages/*/scripts/**/*.{js,mjs,cjs}',
      'packages/*/bin/**/*.{js,mjs,cjs}',
      'packages/*/arch/**/*.{js,mjs,cjs}',
      '*.config.{js,mjs,cjs}',
      'packages/*/*.config.{js,mjs,cjs}',
    ],
    rules: {

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
    },
  },
);
