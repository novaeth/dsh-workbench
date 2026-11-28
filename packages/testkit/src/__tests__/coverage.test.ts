import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { emptyWorld, projectRoute } from '../index';
import { CHANGES_ROUTE, READ_ROUTES } from '../project/routes';

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDENS = join(HERE, '..', '..', 'goldens');

const PARITY_ROUTES = [
  'unit-manifests',
  'bundle-registries',
  'bundle-inspect',
  'capability',
  'panels',
  'module-versions',
  'panels/market-installed',
  'panels/plugins',
] as const;

const RUNTIME_ROUTES = [CHANGES_ROUTE, 'health', 'preflight'] as const;

const GOLDEN_CASES = ['empty', 'installed', 'manifests-failed'] as const;

describe('接管清单覆盖：新路由不补投影/golden/parity 就红', () => {
  it('★ 每条被接管的读口都有投影', () => {
    const world = emptyWorld();
    for (const route of READ_ROUTES) {
      if ((RUNTIME_ROUTES as readonly string[]).includes(route)) continue;
      expect(projectRoute(world, route), `路由 ${route} 没有投影`).toBeDefined();
    }
  });

  it('★ 每条被接管的读口都有契约 golden', () => {
    for (const route of READ_ROUTES) {
      if ((RUNTIME_ROUTES as readonly string[]).includes(route)) continue;
      for (const id of GOLDEN_CASES) {
        const file = join(GOLDENS, id, `${route.replaceAll('/', '-')}.json`);
        expect(existsSync(file), `缺 golden：${id}/${route}`).toBe(true);
      }
    }
  });

  it('★ 每条数据读口都在 parity 捕获里，运行时路由显式列外', () => {
    const covered = new Set<string>([...PARITY_ROUTES, ...RUNTIME_ROUTES]);
    for (const route of READ_ROUTES) {
      expect(covered.has(route), `路由 ${route} 既没有 parity 也没有列进运行时例外`).toBe(true);
    }
  });
});
