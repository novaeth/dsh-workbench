import type { ProvisionAction, ProvisionRequest } from '@dsh-workbench/shared/host';
import type { BundleCancellation, BundleChange } from '@/kernel/contract/bundle-install';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import type { BundleSupply, MarketEntry, MarketService } from './market';
import type { PluginKept } from './plugin-actions';
import type { SharedDependency } from './market-dependency';

export type ProvisionResult =
  | {
      readonly ok: true;
      readonly action: 'install' | 'update' | 'uninstall';
      readonly module: MarketEntry;
      readonly keptFor?: readonly string[];
      readonly change?: BundleChange;
    }
  | {
      readonly ok: true;
      readonly action: 'update-dependency';
      readonly shared: readonly SharedDependency[];
    }
  | {
      readonly ok: true;
      readonly action: 'install-bundle' | 'install-version' | 'update-bundle';
      readonly change: BundleChange;
      readonly module: InstalledModule;
      readonly supply: BundleSupply;
      readonly restored?: string;
    }
  | {
      readonly ok: true;
      readonly action: 'remove-bundle';
      readonly change: BundleChange;
      readonly keptFor: readonly string[];
    }
  | {
      readonly ok: true;
      readonly action: 'cancel-install';
      readonly cancellation: BundleCancellation | null;
    }
  | {
      readonly ok: true;
      readonly action: 'update-plugin';
    }
  | {
      readonly ok: true;
      readonly action: 'update-workbench';
      readonly change: BundleChange;
    }
  | {
      readonly ok: true;
      readonly action: 'migrate-workbench';
      readonly added: number;
      readonly files: number;
    }
  | {
      readonly ok: true;
      readonly action: 'dismiss-followup';
    }
  | {
      readonly ok: true;
      readonly action: 'uninstall-plugin';
      readonly removed: boolean;
      readonly kept?: PluginKept;
    };

function isDependency(action: ProvisionAction): action is 'update-dependency' {
  return action === 'update-dependency';
}

export async function dispatchMarket(
  market: MarketService,
  request: ProvisionRequest,
): Promise<ProvisionResult> {
  if (isDependency(request.action)) {
    const id = request.id ?? '';
    const shared = await market.updateDependency(id);
    return { ok: true, action: request.action, shared };
  }
  if (request.action === 'install-bundle') {
    const outcome = await market.installBundle(request.spec ?? '', {
      ...(request.registry === undefined ? {} : { registry: request.registry }),
      ...(request.approvedBuilds === undefined ? {} : { approvedBuilds: request.approvedBuilds }),
      ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
    });
    return { ok: true, action: 'install-bundle', ...outcome };
  }
  if (request.action === 'install-version') {
    const outcome = await market.replaceBundle(request.spec ?? '', {
      ...(request.registry === undefined ? {} : { registry: request.registry }),
      ...(request.approvedBuilds === undefined ? {} : { approvedBuilds: request.approvedBuilds }),
      ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
    });
    return { ok: true, action: 'install-version', ...outcome };
  }
  if (request.action === 'update-bundle') {
    const outcome = await market.updateBundle(request.unit ?? '');
    return outcome === null
      ? { ok: true, action: 'update', module: await market.update(request.unit ?? '') }
      : { ok: true, action: 'update-bundle', ...outcome };
  }
  if (request.action === 'remove-bundle') {
    const { change, keptFor } = await market.removeBundle(request.name ?? '');
    return { ok: true, action: 'remove-bundle', change, keptFor };
  }
  if (request.action === 'cancel-install') {
    return {
      ok: true,
      action: 'cancel-install',
      cancellation: await market.cancelInstall(request.requestId ?? ''),
    };
  }
  if (request.action === 'migrate-workbench') {
    return { ok: true, action: 'migrate-workbench', ...(await market.migrateWorkbench()) };
  }
  if (request.action === 'dismiss-followup') {
    await market.dismissFollowUp(request.id ?? '');
    return { ok: true, action: 'dismiss-followup' };
  }
  if (request.action === 'update-workbench') {
    const outcome = await market.updateWorkbench(request.name ?? '');
    return { ok: true, action: 'update-workbench', change: outcome.change };
  }
  if (request.action === 'update-plugin') {
    await market.updatePlugin(request.name ?? '');
    return { ok: true, action: 'update-plugin' };
  }
  if (request.action === 'uninstall-plugin') {
    const outcome = await market.uninstallPlugin(request.name ?? '');
    return {
      ok: true,
      action: 'uninstall-plugin',
      removed: outcome.removed,
      ...(outcome.kept === undefined ? {} : { kept: outcome.kept }),
    };
  }
  const unit = request.unit ?? '';
  if (request.action === 'uninstall') {
    const { entry, keptFor, change } = await market.uninstall(unit);
    return {
      ok: true,
      action: 'uninstall',
      module: entry,
      keptFor,
      ...(change === undefined ? {} : { change }),
    };
  }
  if (request.action === 'update') {
    return { ok: true, action: 'update', module: await market.update(unit) };
  }
  return { ok: true, action: 'install', module: await market.install(unit) };
}
