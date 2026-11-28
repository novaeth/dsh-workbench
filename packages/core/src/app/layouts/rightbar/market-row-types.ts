import type { BundleVersionList, ModuleUpdateBlock } from '@/kernel/contract/bundle-install';
import type { MarketInstalledModule } from '@/kernel/contract/market-index';
import type { InstallFailure } from '@dsh-workbench/shared';
import type { FailureCardExtras, FailureCardModel } from './failure-card-text';

export type MarketProblem =
  | { readonly kind: 'startup'; readonly detail?: string }
  | { readonly kind: 'workbench-broken'; readonly command?: string }
  | { readonly kind: 'reinstall'; readonly detail?: string }
  | { readonly kind: 'drift'; readonly declared: string; readonly installed: string };

export interface MarketFailure {
  readonly id: string;
  readonly message: string;
  readonly failure?: InstallFailure;
  readonly card?: FailureCardModel & FailureCardExtras;
  readonly action?: MarketRowAction;
  readonly detail?: string;
  readonly retry?: MarketRowAction;
  readonly pendingBuilds?: readonly string[];
}

export type MarketRowAction =
  | 'install'
  | 'update'
  | 'update-bundle'
  | 'install-version'
  | 'remove-bundle'
  | 'uninstall'
  | 'update-dependency'
  | 'update-plugin'
  | 'uninstall-plugin'
  | 'update-workbench'
  | 'migrate-workbench'
  | 'dismiss-followup';

export type MarketState =
  | 'checking'
  | 'installed'
  | 'inactive'
  | 'unusable'
  | 'broken'
  | 'unsupported'
  | 'outdated'
  | 'older-on-disk'
  | 'pending-restart'
  | 'pending-followup'
  | 'missing'
  | 'unchecked'
  | 'unknown';

export interface MarketNote {
  readonly key:
    | 'panels.market.needEnv'
    | 'panels.market.noSource'
    | 'panels.market.badSource'
    | 'panels.market.needBinary'
    | 'panels.market.needLib'
    | 'panels.market.needBuiltinMissing'
    | 'panels.market.noSourceNeed'
    | 'panels.market.moduleRefused'
    | 'panels.market.moduleRestartHint'
    | 'panels.market.pluginAlsoKnownAs'
    | 'panels.market.pluginBroken'
    | 'panels.market.latestNoRegistry'
    | 'panels.market.latestProbeFailed'
    | 'panels.market.runtimeVersionMismatch'
    | 'panels.market.workbenchBroken'
    | 'panels.market.workbenchBrokenNoFix'
    | 'panels.market.selfUpdateQueued'
    | 'panels.market.selfUpdatePendingRestart'
    | 'panels.market.selfUpdateRetry'
    | 'panels.market.selfUpdateNeedsHost'
    | 'panels.market.selfUpdateBusy'
    | 'panels.market.selfUpdateReinstallFailed'
    | 'panels.market.selfUpdateReinstallStopped'
    | 'panels.market.configDriftedNote'
    | 'panels.market.olderOnDiskNote';
  readonly params: Readonly<Record<string, string>>;
  readonly tone?: 'plain' | 'alert';
}

export type MarketHintKey =
  | 'panels.market.moduleRestartHint'
  | 'panels.market.uncheckedHint'
  | 'panels.market.migrationHint'
  | 'panels.market.updateNeedsWorkbench'
  | 'panels.market.needsHostVersion'
  | 'panels.market.updateIncompatible'
  | 'panels.market.updateUnverified'
  | 'panels.market.selfUpdateMigration';

export interface MarketHint {
  readonly key: MarketHintKey;
  readonly params?: Readonly<Record<string, string>>;
}

export interface ModuleUpdate {
  readonly installed: string;
  readonly latest?: string;
  readonly local?: boolean;
  readonly blocked?: ModuleUpdateBlock;
  readonly market?: MarketInstalledModule;
  readonly versions?: BundleVersionList;
  readonly pkg?: string;
  readonly spec?: string;
  readonly registry?: string;
}

export interface MarketFollowUp {
  readonly id: string;
  readonly kind: 'data-migration';
  readonly hard: boolean;
}

export interface MarketRow {
  readonly id: string;
  readonly titleKey: string;
  readonly label?: string;
  readonly state: MarketState;
  readonly canInstall: boolean;
  readonly canUpdate: boolean;
  readonly canUninstall: boolean;
  readonly plugin?: boolean;
  readonly workbench?: boolean;
  readonly note?: MarketNote;
  readonly hint?: MarketHint;
  readonly version?: { readonly installed?: string; readonly latest?: string };
  readonly moduleUpdate?: ModuleUpdate;
  readonly staleDeps?: number;
  readonly market?: MarketInstalledModule;
  readonly pkg?: string;
  readonly local?: boolean;
  readonly versionLabel?: string;
  readonly defaultShown?: boolean;
  readonly defaultChanged?: number;
  readonly broken?: boolean;
  readonly stateKey?: string;
  readonly problem?: MarketProblem;
  readonly followUp?: MarketFollowUp;
  readonly spec?: string;
  readonly registry?: string;
  readonly reinstall?: string;
  readonly installedAt?: string;
  readonly runtimeProblem?:
    | { readonly label: string; readonly need: string; readonly have: string }
    | undefined;
  readonly removeViaBundle?: boolean;
}
