import { describe, expect, it } from 'vitest';
import type { DshHostContext } from '@dsh-workbench/shared';
import { createFactLog, WORKBENCH_ADAPTERS, type ProfilePort } from '@dsh-workbench/shared/host';
import { createHostRoutes } from '../host-routes';
import { MODULE_VERSIONS_ROUTE } from '@/kernel/contract/bundle-install';

const profile = {
  dirOf: () => null,
  dshPlugins: () => async () => ({ ok: true, plugins: [] }),
  selfUpdateView: () => ({}),
} as unknown as ProfilePort;

const ctx = {
  get: (name: string) => {
    if (name === WORKBENCH_ADAPTERS) throw new Error('构造读口时不该查 workbenchAdapters：apply 里刚 provide，纤维还没 active');
    return undefined;
  },
} as unknown as DshHostContext;

describe('外壳读口路由：一张表交出去，不让 app/host.ts 继续长', () => {
  it('适配器还没对外可见时也能把表建出来（apply 期不查服务）', async () => {
    const routes = createHostRoutes({
      ctx,
      facts: createFactLog(),
      opencli: { command: 'opencli', source: 'path', isolated: null },
      running: undefined,
      profile,
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
      profile,
    });

    const result = await routes[MODULE_VERSIONS_ROUTE]?.(new URLSearchParams());

    expect(result).toEqual({ ok: true, modules: [] });
  });
});
