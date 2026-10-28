import type { DshShell } from '@dsh-workbench/shared';
import type { BundleManager, SupplyPort } from '@dsh-workbench/shared/host';
import { quoteShellArg, requireSupply } from '@dsh-workbench/shared/host';
import type { InstalledModule, ProfileModule } from '@dsh-workbench/shared/host';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import { replaceDshBundle, type ReplaceBundleDeps } from './market-route';
import { verifyBundleUpdate } from './market-verify';
import { swapExternally } from './market-swap-stuck';
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
  readonly profile?: string | undefined;
  readonly dshHome?: string | undefined;
  readonly profileName?: string | undefined;
  readonly swapWaitMs?: number | undefined;
  readonly swapPollMs?: number | undefined;
}

const SHIPPED_APPLICATIONS: ReadonlySet<string> = new Set(['applied', 'restart-required', 'overridden']);

function stillStuck(change: BundleChange, after: InstalledModule, before: string | undefined): boolean {
  if (!SHIPPED_APPLICATIONS.has(change.application)) return true;
  return before !== undefined && after.kind === 'module' && after.version === before;
}

function remedyOf(
  deps: BundleUpdateDeps,
  change: { readonly application: string },
  before: string | undefined,
  afterVersion: string | undefined,
  spec: string,
): { readonly command: string } | undefined {
  const name = deps.profileName ?? deps.profile;
  if (name === undefined) return undefined;
  const stuck = !SHIPPED_APPLICATIONS.has(change.application);
  const unchanged = before !== undefined && afterVersion === before;
  if (!stuck && !unchanged) return undefined;
  return { command: `dsh plugin --profile ${name} add ${quoteShellArg(spec)}` };
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
  let after = deps.installed?.(pkg) ?? { kind: 'unknown', pkg };
  const verified = verifyBundleUpdate({
    change: outcome.change,
    before,
    after,
    ...(restored === undefined ? {} : { restored }),
  });
  let change = verified.change;
  let restoredVersion = verified.restored;
  const swap =
    stillStuck(change, after, before) && before !== undefined && deps.dshHome !== undefined && deps.profileName !== undefined
      ? await swapExternally(
          {
            supply,
            installed: deps.installed,
            dshHome: deps.dshHome,
            profile: deps.profileName,
            ...(deps.logger === undefined ? {} : { logger: deps.logger }),
            ...(deps.swapWaitMs === undefined ? {} : { waitMs: deps.swapWaitMs }),
            ...(deps.swapPollMs === undefined ? {} : { pollMs: deps.swapPollMs }),
          },
          { pkg, from: before, to: latest ?? '', pinned: latest !== undefined },
        )
      : undefined;
  if (swap !== undefined) {
    const swapVersion = swap.kind === 'module' ? swap.version : '';
    after = swap;
    restoredVersion = undefined;
    change = {
      application: 'restart-required',
      stage: 'install',
      changed: true,
      target: pkg,
      bundle: pkg,
      ...(swapVersion === '' ? {} : { version: swapVersion }),
    };
  }
  await deps.refreshSupply(unit).catch(() => undefined);
  const remedy = stillStuck(change, after, before)
    ? remedyOf(deps, change, before, after.kind === 'module' ? after.version : undefined, spec)
    : undefined;
  return {
    ...outcome,
    change,
    module: after,
    ...(restoredVersion === undefined ? {} : { restored: restoredVersion }),
    ...(remedy === undefined ? {} : { remedy }),
  };
}
