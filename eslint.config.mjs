import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/client.js',
      '**/client.body.js',
      '**/*.d.ts',
      '**/test/golden/**',
      '.scratch/**',
      'private-docs/**',
      '.worktrees/**',
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
      'packages/workbench/src/shared/hooks/use-api-resource.ts',
      'packages/workbench/src/shared/hooks/use-capabilities.ts',
      'packages/workbench/src/shared/hooks/use-unit-board.ts',
      'packages/workbench/src/shared/hooks/use-visible-busy.ts',
      'packages/workbench/src/app/layouts/rightbar/use-panels.ts',
    ],
    rules: { 'react-hooks/immutability': 'off' },
  },

  {
    files: ['packages/workbench/src/shared/api/host/__tests__/preflight-warm.test.ts'],
    rules: { 'prefer-const': 'off' },
  },
  {
    files: ['packages/shared/src/lib/react.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        module: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
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
