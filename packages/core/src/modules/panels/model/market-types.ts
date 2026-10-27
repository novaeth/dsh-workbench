import type { Need } from '@dsh-workbench/shared';
import type { ProvisionAction } from '@dsh-workbench/shared/host';
import type { BundleCancellation, BundleChange, BundleInstalledPlugin } from '@/kernel/contract/bundle-install';
import type { InstalledModule } from '@dsh-workbench/shared/host';
import type { UnitCapability } from '@dsh-workbench/shared/host';
import type { PluginUninstallOutcome, PluginUpdateOutcome } from './plugin-actions';
import type { SharedDependency } from './market-dependency';

export type MarketAction = ProvisionAction;

export interface MarketEntry {
  readonly unit: string;
  readonly titleKey: string;
  readonly needs: readonly Need[];
  readonly capability: UnitCapability;
}

export interface UninstallResult {
  readonly entry: MarketEntry;
  readonly keptFor: readonly string[];
  readonly change?: BundleChange;
}

export interface BundleInstallOptions {
  readonly registry?: string | undefined;
  readonly approvedBuilds?: readonly string[] | undefined;
  readonly requestId?: string | undefined;
}

export type BundleSupply =
  | { readonly state: 'not-a-module' }
  | { readonly state: 'no-needs' }
  | { readonly state: 'installed'; readonly entry: MarketEntry }
  | { readonly state: 'failed'; readonly reason: string }
  | { readonly state: 'pending-restart' };

export interface BundleInstallOutcome {
  readonly change: BundleChange;
  readonly module: InstalledModule;
  readonly supply: BundleSupply;
  readonly plugin?: BundleInstalledPlugin;
  readonly restored?: string;
}

export interface BundleRemoveOutcome {
  readonly change: BundleChange;
  readonly keptFor: readonly string[];
}

export interface MarketService {
  list(): Promise<{ readonly modules: MarketEntry[]; readonly shared: readonly SharedDependency[] }>;
  install(unit: string): Promise<MarketEntry>;
  update(unit: string): Promise<MarketEntry>;
  uninstall(unit: string): Promise<UninstallResult>;
  updateDependency(id: string): Promise<readonly SharedDependency[]>;
  installBundle(spec: string, options?: BundleInstallOptions): Promise<BundleInstallOutcome>;
  replaceBundle(spec: string, options?: BundleInstallOptions): Promise<BundleInstallOutcome>;
  updateBundle(unit: string): Promise<BundleInstallOutcome | null>;
  updateWorkbench(pkg: string): Promise<BundleInstallOutcome>;
  migrateWorkbench(): Promise<{ readonly added: number; readonly files: number }>;
  dismissFollowUp(id: string): Promise<void>;
  removeBundle(pkg: string): Promise<BundleRemoveOutcome>;
  cancelInstall(requestId: string): Promise<BundleCancellation | null>;
  updatePlugin(pkg: string): Promise<PluginUpdateOutcome>;
  uninstallPlugin(pkg: string): Promise<PluginUninstallOutcome>;
}
