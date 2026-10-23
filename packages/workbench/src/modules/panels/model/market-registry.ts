import type { BundleChange } from '@/shared/api/bundle-install';
import type { BundleManager } from '@/shared/api/host/bundle-manager';
import {
  registryFailure,
  sameRegistry,
  scopeOf,
  type RegistryNotebook,
} from '@/shared/api/host/profile-registries';

export interface RegistryFixDeps {
  readonly registries?: RegistryNotebook | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}

export async function rememberInstalledSource(
  deps: RegistryFixDeps,
  manager: BundleManager,
  pkg: string,
  registry: string | undefined,
): Promise<void> {
  const { registries, logger } = deps;
  if (registries === undefined || registry === undefined) return;
  const scope = scopeOf(pkg);
  if (scope === null) return;
  const known = await manager.registries().catch(() => null);
  if (known !== null && sameRegistry(known.resolved, registry)) return;
  try {
    const added = registries.remember([{ scope, registry }]);
    if (added.length > 0) {
      logger?.info?.(`[dsh-workbench] 把 ${added.join('、')} 记进 profile 的 .npmrc（卸载只认 pnpm 的配置）`);
    }
  } catch (error) {
    logger?.warn?.(`[dsh-workbench] 记这个 scope 的源失败：${String(error)}`);
  }
}

export async function retryAfterRegistryFix(
  deps: RegistryFixDeps,
  manager: BundleManager,
  pkg: string,
  change: BundleChange,
): Promise<BundleChange> {
  const { registries, logger } = deps;
  if (registries === undefined || !registryFailure(change)) return change;
  const known = await manager.registries().catch(() => null);
  const missing = registries.sources().filter((entry) => !sameRegistry(entry.registry, known?.resolved ?? null));
  if (missing.length === 0) return change;
  let added: readonly string[];
  try {
    added = registries.remember(missing);
  } catch (error) {
    logger?.warn?.(`[dsh-workbench] 卸 ${pkg} 撞上源，但补配置失败：${String(error)}`);
    return change;
  }
  if (added.length === 0) return change;
  logger?.warn?.(`[dsh-workbench] 卸 ${pkg} 撞上源：补 ${added.join('、')} 后重试一次`);
  const again = await manager.remove(pkg).catch(() => null);
  return again ?? change;
}
