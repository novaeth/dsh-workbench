import type { ModuleUpdateBlock } from '@/kernel/contract/bundle-install';

export type MarketRowAction =
  | 'install'
  | 'update'
  | 'update-bundle'
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
  | 'outdated'
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
    | 'panels.market.needCommands'
    | 'panels.market.needBinary'
    | 'panels.market.needLib'
    | 'panels.market.moduleRefused'
    | 'panels.market.moduleRestartHint'
    | 'panels.market.pluginAlsoKnownAs'
    | 'panels.market.pluginBroken';
  readonly params: Readonly<Record<string, string>>;
  readonly tone?: 'plain' | 'alert';
}

export type MarketHintKey =
  | 'panels.market.moduleRestartHint'
  | 'panels.market.uncheckedHint'
  | 'panels.market.migrationHint'
  | 'panels.market.updateNeedsWorkbench'
  | 'panels.market.updateIncompatible';

export interface ModuleUpdate {
  readonly installed: string;
  readonly latest?: string;
  readonly local?: boolean;
  readonly blocked?: ModuleUpdateBlock;
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
  readonly hint?: MarketHintKey;
  readonly version?: { readonly installed?: string; readonly latest?: string };
  readonly moduleUpdate?: ModuleUpdate;
  readonly pkg?: string;
  readonly local?: boolean;
  readonly versionLabel?: string;
  readonly defaultShown?: boolean;
  readonly defaultChanged?: number;
  readonly broken?: boolean;
  readonly followUp?: MarketFollowUp;
}
