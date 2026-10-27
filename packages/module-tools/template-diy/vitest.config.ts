import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/modules\/__UNIT__\//, replacement: `${here('./src')}/` },
      { find: /^@\/platforms\/[^/]+\//, replacement: `${here('./src/platforms')}/` },
    ],
  },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
