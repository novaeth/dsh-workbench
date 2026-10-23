import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));
const shell = (subpath: string): string => fileURLToPath(import.meta.resolve(`@dsh-workbench/core/${subpath}`));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@dsh-workbench/core/client', replacement: shell('client/esm') },
      { find: /^@\/modules\/hello\//, replacement: `${here('./src')}/` },
      { find: /^@\/platforms\/[^/]+\//, replacement: `${here('./src/platforms')}/` },
      {
        find: '@deepseek-ai/dsh-client-ui-primitives',
        replacement: here('../workbench/scripts/dsh-primitives-stub.ts'),
      },
    ],
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
