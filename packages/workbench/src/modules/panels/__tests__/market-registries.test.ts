import { describe, expect, it, vi } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { BundleChange } from '@/shared/api/bundle-install';
import type { BundleManager } from '@/shared/api/host/bundle-manager';
import type { RegistryEntry, RegistryNotebook } from '@/shared/api/host/profile-registries';
import { createMarketService } from '../model/market';

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const PRIVATE_REGISTRY = 'https://npm.example.com/team/';

const manifest: UnitManifest = {
  id: 'inventory',
  card: { titleKey: 'inventory.title', order: 10 },
  tools: [],
  host: { inject: [] },
  env: { command: 'opencli', plugins: [{ name: 'inventory', commands: ['x'] }] },
};

const change = (over: Partial<BundleChange> = {}): BundleChange => ({
  application: 'applied',
  stage: 'install',
  changed: true,
  target: '@scope/name',
  bundle: '@scope/name',
  ...over,
});

const notFound = (): BundleChange =>
  change({
    stage: 'remove',
    application: 'failed',
    changed: false,
    packageResult: { exitCode: 1, output: 'ERR_PNPM_FETCH_404 GET https://x', truncated: false, logPath: '', kind: 'not-found' },
  });

function bundlesOf(over: Partial<BundleManager> = {}): BundleManager {
  return {
    registries: async () => ({ registry: null, fallbackRegistries: [], resolved: DEFAULT_REGISTRY }),
    inspect: async () => null,
    install: async () => change(),
    remove: async () => change({ stage: 'remove' }),
    cancel: async () => 'cancelled',
    ...over,
  };
}

function notebookOf(entries: readonly RegistryEntry[] = [{ scope: '@scope', registry: PRIVATE_REGISTRY }]): RegistryNotebook & {
  readonly remember: ReturnType<typeof vi.fn>;
} {
  return {
    sources: () => entries,
    remember: vi.fn((wanted: readonly RegistryEntry[]) => wanted.map((entry) => `${entry.scope}:registry`)),
  };
}

describe('装的时候把私有 scope 的源记一行', () => {
  it('★ 用户挑了自定义源装 → 记进 profile 的 .npmrc（卸载只认 pnpm 的配置）', async () => {
    const book = notebookOf();
    const market = createMarketService({ manifests: [manifest], bundles: bundlesOf(), registries: book });

    await market.installBundle('@scope/name@1.2.3', { registry: PRIVATE_REGISTRY });

    expect(book.remember).toHaveBeenCalledWith([{ scope: '@scope', registry: PRIVATE_REGISTRY }]);
  });

  it('没带源 → 不写（默认源本来就问得到）', async () => {
    const book = notebookOf();
    const market = createMarketService({ manifests: [manifest], bundles: bundlesOf(), registries: book });

    await market.installBundle('@scope/name');

    expect(book.remember).not.toHaveBeenCalled();
  });

  it('带的就是 pnpm 自己那个源 → 不写（写了也只是噪声）', async () => {
    const book = notebookOf();
    const market = createMarketService({ manifests: [manifest], bundles: bundlesOf(), registries: book });

    await market.installBundle('@scope/name', { registry: DEFAULT_REGISTRY });

    expect(book.remember).not.toHaveBeenCalled();
  });

  it('没有 scope 的包 → 不写（一行 scope 表达不了它）', async () => {
    const book = notebookOf();
    const market = createMarketService({
      manifests: [manifest],
      bundles: bundlesOf({ install: async () => change({ bundle: 'plain-pkg' }) }),
      registries: book,
    });

    await market.installBundle('plain-pkg', { registry: PRIVATE_REGISTRY });

    expect(book.remember).not.toHaveBeenCalled();
  });
});

describe('卸失败撞上源 → 补一行再卸一次', () => {
  it('★ 第一次 404 → 从 lockfile 推出的源补进 .npmrc → 重试成功（用户只看到"转久一点"）', async () => {
    let calls = 0;
    const book = notebookOf();
    const market = createMarketService({
      manifests: [manifest],
      bundles: bundlesOf({
        remove: async () => {
          calls += 1;
          return calls === 1 ? notFound() : change({ stage: 'remove' });
        },
      }),
      registries: book,
    });

    const outcome = await market.removeBundle('@scope/name');

    expect(calls).toBe(2);
    expect(book.remember).toHaveBeenCalledWith([{ scope: '@scope', registry: PRIVATE_REGISTRY }]);
    expect(outcome.change.application).toBe('applied');
  });

  it('★ 重试还是失败 → 如实把第二次的结果交出去（别假装成功）', async () => {
    let calls = 0;
    const book = notebookOf();
    const market = createMarketService({
      manifests: [manifest],
      bundles: bundlesOf({
        remove: async () => {
          calls += 1;
          return notFound();
        },
      }),
      registries: book,
    });

    const outcome = await market.removeBundle('@scope/name');

    expect(calls).toBe(2);
    expect(outcome.change.application).toBe('failed');
  });

  it('不是源的问题（比如还有东西在用）→ 只卸一次，一个字都不写', async () => {
    const book = notebookOf();
    const remove = vi.fn(async () => change({ stage: 'remove', application: 'failed', changed: false }));
    const market = createMarketService({ manifests: [manifest], bundles: bundlesOf({ remove }), registries: book });

    const outcome = await market.removeBundle('@scope/name');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(book.remember).not.toHaveBeenCalled();
    expect(outcome.change.application).toBe('failed');
  });

  it('lockfile 里推不出任何私有源 → 不重试（省一次白等）', async () => {
    const book = notebookOf([]);
    const remove = vi.fn(async () => notFound());
    const market = createMarketService({ manifests: [manifest], bundles: bundlesOf({ remove }), registries: book });

    const outcome = await market.removeBundle('@scope/name');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(outcome.change.application).toBe('failed');
  });

  it('源已经在 lockfile 里、且等于 pnpm 自己那个 → 不写也不重试', async () => {
    const book = notebookOf([{ scope: '@scope', registry: DEFAULT_REGISTRY }]);
    const remove = vi.fn(async () => notFound());
    const market = createMarketService({ manifests: [manifest], bundles: bundlesOf({ remove }), registries: book });

    await market.removeBundle('@scope/name');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(book.remember).not.toHaveBeenCalled();
  });
});
