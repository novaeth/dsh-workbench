import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { BundleManager } from '@dsh-workbench/shared/host';
import { forgetPackageSource, packageSourceOf, scopeOf } from '@dsh-workbench/shared/host';
import { retryAfterRegistryFix, type RegistryFixDeps } from './market-registry';

export interface RemoveBundleOptions {
  readonly manager: BundleManager;
  readonly pkg: string;
  readonly profileDir?: string | null | undefined;
  readonly registryFix: RegistryFixDeps;
  readonly logger?: { warn?(message: string): void } | undefined;
}

let chain: Promise<unknown> = Promise.resolve();

function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const run = chain.then(operation, operation);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function forgetSource(options: RemoveBundleOptions): void {
  const dir = options.profileDir;
  if (dir === undefined || dir === null) return;
  try {
    forgetPackageSource(dir, options.pkg);
  } catch (error) {
    options.logger?.warn?.(`[dsh-workbench] 清 ${options.pkg} 的来源记录失败：${String(error)}`);
  }
}

function swapScopeFor(options: RemoveBundleOptions): (() => void) | undefined {
  const dir = options.profileDir;
  const notebook = options.registryFix.registries;
  if (dir === undefined || dir === null || notebook?.swapScope === undefined) return undefined;
  const source = packageSourceOf(dir, options.pkg);
  const scope = scopeOf(options.pkg);
  if (source === undefined || scope === null) return undefined;
  try {
    return notebook.swapScope(scope, source.registry);
  } catch (error) {
    options.logger?.warn?.(
      `[dsh-workbench] 临时把 ${scope} 指到 ${source.registry} 失败，卸载照走：${String(error)}`,
    );
    return undefined;
  }
}

async function removeOnce(options: RemoveBundleOptions): Promise<BundleChange> {
  const { manager, pkg, registryFix, logger } = options;
  const first = await manager.remove(pkg);
  if (first === null) throw new Error('插件管理器回的卸载结果看不懂。');
  const settled = await retryAfterRegistryFix(registryFix, manager, pkg, first);
  if (settled.application !== 'failed' && settled.application !== 'cancelled') {
    forgetSource(options);
    return settled;
  }
  const put = await manager.setEnabled?.(pkg, true);
  logger?.warn?.(
    `[dsh-workbench] ${pkg} 没卸成（${settled.errorCode ?? settled.application}）—— 已把它那一行放回名单，别让一次失败留在"装着但关着"`,
  );
  return put ?? settled;
}

export function removeDshBundle(options: RemoveBundleOptions): Promise<BundleChange> {
  return serialized(async () => {
    const restore = swapScopeFor(options);
    try {
      return await removeOnce(options);
    } finally {
      try {
        restore?.();
      } catch (error) {
        options.logger?.warn?.(`[dsh-workbench] 还原 .npmrc 失败：${String(error)}`);
      }
    }
  });
}
