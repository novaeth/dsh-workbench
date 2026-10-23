export type MarketRowAction =
  | 'install'
  | 'update'
  | 'update-bundle'
  | 'remove-bundle'
  | 'uninstall'
  | 'update-dependency'
  | 'update-plugin'
  | 'uninstall-plugin'
  | 'update-workbench';

export type MarketState =
  | 'checking'
  | 'installed'
  | 'inactive'
  | 'unusable'
  | 'broken'
  | 'outdated'
  | 'pending-restart'
  | 'missing'
  | 'unchecked'
  | 'unknown';

export interface MarketNote {
  readonly key:
    | 'panels.market.needEnv'
    | 'panels.market.noSource'
    | 'panels.market.badSource'
    | 'panels.market.needCommands'
    | 'panels.market.moduleRefused'
    | 'panels.market.moduleRestartHint'
    | 'panels.market.pluginAlsoKnownAs'
    | 'panels.market.pluginBroken'
    | 'panels.market.workbenchLocal';
  readonly params: Readonly<Record<string, string>>;
  readonly tone?: 'plain' | 'alert';
}

export type MarketHintKey = 'panels.market.moduleRestartHint';

export interface ModuleUpdate {
  readonly installed: string;
  readonly latest?: string;
  readonly local?: boolean;
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
}
