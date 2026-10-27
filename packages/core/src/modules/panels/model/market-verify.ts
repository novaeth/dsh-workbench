import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import type { DependencyTarget } from './market-dependency';

const SHIPPED: ReadonlySet<string> = new Set(['applied', 'restart-required', 'overridden']);

function failedAs(change: BundleChange, errorCode: string, errorDetail: string): BundleChange {
  return { ...change, application: 'failed', errorCode, errorDetail };
}

export function verifyBundleUpdate(input: {
  readonly change: BundleChange;
  readonly before: string | undefined;
  readonly after: InstalledModule;
  readonly restored?: string | undefined;
}): { readonly change: BundleChange; readonly restored?: string } {
  const { change, before, after, restored } = input;
  const restoredPart = restored === undefined ? {} : { restored };
  if (after.kind !== 'module') {
    const tail =
      before === undefined
        ? '更新跑完盘上读不到这个模块'
        : restored === undefined
          ? `更新跑完盘上读不到这个模块（更新前是 ${before}）`
          : `更新跑完盘上读不到这个模块（更新前是 ${before}，已把 ${restored} 装回去）`;
    return { change: failedAs(change, 'module-gone', tail), ...restoredPart };
  }
  const version = after.version === '' ? undefined : after.version;
  const withVersion: BundleChange = version === undefined ? change : { ...change, version };
  if (restored !== undefined && SHIPPED.has(change.application)) {
    return {
      change: failedAs(
        withVersion,
        'module-gone',
        `更新跑完盘上读不到这个模块（更新前是 ${before ?? '?'}），已把 ${restored} 装回去`,
      ),
      restored,
    };
  }
  if (SHIPPED.has(change.application) && before !== undefined && version === before) {
    return {
      change: failedAs(withVersion, 'no-change', `点下去是 ${before}，跑完盘上还是 ${version}`),
      ...restoredPart,
    };
  }
  return { change: withVersion, ...restoredPart };
}

export function supplyUpdateStillBehind(after: UnitCapability): string | undefined {
  const stale = after.needs.find((need) => need.status === 'outdated' || need.status === 'unsatisfied');
  if (stale === undefined) return undefined;
  return `更新命令跑完了，但这一格还是旧的样子：${stale.detail}`;
}

export function dependencyStillBehind(
  target: DependencyTarget,
  capabilities: ReadonlyMap<string, UnitCapability>,
): string | undefined {
  for (const manifest of target.declarers) {
    const seen = capabilities
      .get(manifest.id)
      ?.needs.find((item) => item.kind === target.kind && item.name === target.name);
    if (seen === undefined) continue;
    if (seen.status !== 'outdated' && seen.status !== 'unsatisfied') continue;
    const version =
      seen.installed === undefined
        ? ''
        : seen.latest === undefined
          ? `（装的是 ${seen.installed}）`
          : `（${seen.installed} → ${seen.latest}）`;
    return `${target.name} 还是旧的样子${version}`;
  }
  return undefined;
}
