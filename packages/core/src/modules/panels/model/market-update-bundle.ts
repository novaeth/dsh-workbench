import type { DshShell } from '@dsh-workbench/shared';
import type { BundleManager, SupplyPort } from '@dsh-workbench/shared/host';
import { requireSupply } from '@dsh-workbench/shared/host';
import type { InstalledModule, ProfileModule } from '@dsh-workbench/shared/host';
import { replaceDshBundle, type ReplaceBundleDeps } from './market-route';
import { verifyBundleUpdate } from './market-verify';
import type { BundleInstallOutcome } from './market-types';

export interface BundleUpdateDeps {
  readonly modules: (() => readonly ProfileModule[]) | undefined;
  readonly installed: ((pkg: string) => InstalledModule) | undefined;
  readonly shell: DshShell | undefined;
  readonly manager: BundleManager;
  readonly routeDeps: ReplaceBundleDeps;
  readonly sweep: () => Promise<void>;
  readonly refreshSupply: (unit: string) => Promise<void>;
  readonly logger?: { warn?(message: string): void } | undefined;
  readonly supply?: SupplyPort | undefined;
}

async function restoreRemovedBundle(
  pkg: string,
  before: string | undefined,
  registry: string | undefined,
  deps: BundleUpdateDeps,
): Promise<string | undefined> {
  if (before === undefined) return undefined;
  try {
    const change = await deps.manager.install({
      spec: `${pkg}@${before}`,
      ...(registry === undefined ? {} : { registry }),
    });
    const back = deps.installed?.(pkg) ?? { kind: 'unknown', pkg };
    if (change !== null && back.kind === 'module' && back.version === before) {
      deps.logger?.warn?.(`[dsh-workbench] ${pkg} 更新后盘上读不到它了 —— 已把 ${before} 装回去`);
      return before;
    }
    deps.logger?.warn?.(`[dsh-workbench] ${pkg} 更新后盘上读不到它了，装回 ${before} 也没成`);
  } catch (error) {
    deps.logger?.warn?.(
      `[dsh-workbench] ${pkg} 更新后盘上读不到它了，装回 ${before} 失败：${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return undefined;
}

export async function updateModuleBundle(
  unit: string,
  deps: BundleUpdateDeps,
): Promise<BundleInstallOutcome | null> {
  const supply = deps.supply ?? requireSupply();
  const found = (deps.modules?.() ?? []).find((item) => item.unit === unit);
  if (found === undefined) return null;
  if (found.local === true) {
    throw new Error(`这份模块装的是本地那一份（${found.pkg}），不从源上更新 —— 要更新先把它换成源上的版本。`);
  }
  const pkg = found.pkg;
  const before = found.version;
  const read = deps.installed?.(pkg) ?? { kind: 'unknown', pkg };
  const registry = read.kind === 'module' ? read.registry : undefined;
  const latest =
    deps.shell === undefined || registry === undefined
      ? undefined
      : await supply.latestVersion({ shell: deps.shell, name: pkg, registry, force: true });
  if (latest !== undefined && deps.shell !== undefined && registry !== undefined) {
    const declared = await supply.registryDeclarationOf({
      shell: deps.shell,
      name: pkg,
      registry,
      force: true,
    });
    if (declared !== undefined && supply.declarationRefusalOf(pkg, declared).length > 0) {
      throw new Error('源上的新版和当前这一版工作台不匹配 —— 先升级工作台，再更新这个模块。');
    }
  }
  const spec = latest === undefined ? pkg : `${pkg}@${latest}`;
  const outcome = await replaceDshBundle(deps.routeDeps, spec, {
    ...(registry === undefined ? {} : { registry }),
  });
  await deps.sweep();
  const restored =
    (deps.installed?.(pkg) ?? { kind: 'unknown', pkg }).kind === 'module'
      ? undefined
      : await restoreRemovedBundle(pkg, before, registry, deps);
  const after = deps.installed?.(pkg) ?? { kind: 'unknown', pkg };
  const verified = verifyBundleUpdate({
    change: outcome.change,
    before,
    after,
    ...(restored === undefined ? {} : { restored }),
  });
  await deps.refreshSupply(unit).catch(() => undefined);
  return {
    ...outcome,
    change: verified.change,
    module: after,
    ...(verified.restored === undefined ? {} : { restored: verified.restored }),
  };
}
