import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { srcAlias } from './vite.config.ts';

export default defineConfig({

  resolve: {
    alias: [
      ...Object.entries(srcAlias).map(([find, replacement]) => ({ find, replacement })),
      {
        find: '@deepseek-ai/dsh-client-ui-primitives',
        replacement: fileURLToPath(new URL('./scripts/dsh-primitives-stub.ts', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/dev/surface.ts', './vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],

    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx'],

      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/__tests__/**',
        'src/app/**',
        'src/**/views/**',

        'src/**/hooks/**',
        'src/**/components/**',

        'src/shared/api/dsh.ts',
      ],
    },
  },
});
