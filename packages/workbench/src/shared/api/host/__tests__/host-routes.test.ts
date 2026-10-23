import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { createFactLog } from '@dsh-workbench/shared/host';
import { createHostRoutes } from '../host-routes';
import { MODULE_VERSIONS_ROUTE } from '@/shared/api/bundle-install';

const ctx = {
  get: () => undefined,
} as unknown as DshHostContext;

describe('外壳读口路由：一张表交出去，不让 app/host.ts 继续长', () => {
  it('健康 / 事实 / 模块版本都在表上', async () => {
    const routes = createHostRoutes({
      ctx,
      facts: createFactLog(),
      opencli: { command: 'opencli', source: 'path', isolated: null },
      running: undefined,
    });

    expect(Object.keys(routes)).toEqual(
      expect.arrayContaining(['health', 'changes', MODULE_VERSIONS_ROUTE]),
    );
  });

  it('没有插件管理器 → 模块版本回空表，不抛', async () => {
    const routes = createHostRoutes({
      ctx,
      facts: createFactLog(),
      opencli: { command: 'opencli', source: 'path', isolated: null },
      running: undefined,
    });

    const result = await routes[MODULE_VERSIONS_ROUTE]?.(new URLSearchParams());

    expect(result).toEqual({ ok: true, modules: [] });
  });
});
