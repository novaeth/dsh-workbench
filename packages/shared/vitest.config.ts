import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },

  resolve: {
    alias: [
      { find: /^@dsh-workbench\/shared$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },

      {
        find: '@deepseek-ai/dsh-client-ui-primitives',
        replacement: fileURLToPath(new URL('./scripts/dsh-primitives-stub.ts', import.meta.url)),
      },
    ],
  },
});
