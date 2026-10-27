export const MARKET_INDEX_FORMAT = 1;
export const MARKET_INDEX_PATH = 'market.json';
export const MARKET_DISCOVER_ROUTE = 'panels/market-discover';
export const MARKET_DOC_ROUTE = 'panels/market-doc';
export const MARKET_PUBLISH_PREVIEW_ROUTE = 'panels/market-publish-preview';
export const MARKET_SOURCES_RESOURCE = 'market-sources';
export const MARKET_SOURCES_ROUTE = 'panels/market-sources';
export const MARKET_WORKBENCH_LABEL = 'workbench';

export type MarketSourceKind = 'http' | 'git';

export type MarketSourcePolicy = 'artifacts-in-repo' | 'catalog-only';

export interface IndexSourceSpec {
  readonly kind: MarketSourceKind;
  readonly url: string;
  readonly ref?: string;
  readonly path?: string;
  readonly localPath?: string;
}

export interface MarketSourceConfig extends IndexSourceSpec {
  readonly id: string;
  readonly label: string;
  readonly policy?: MarketSourcePolicy;
}

export interface MarketLocalizedText {
  readonly zh?: string;
  readonly en?: string;
}

export interface MarketIndexNpmSource {
  readonly type: 'npm';
  readonly registry?: string;
}

export interface MarketIndexGitSource {
  readonly type: 'git';
  readonly url: string;
  readonly commit: string;
  readonly path?: string;
}

export type MarketIndexSource = MarketIndexNpmSource | MarketIndexGitSource;

export interface MarketIndexEngines {
  readonly dsh?: string;
}

export interface MarketIndexVersion {
  readonly version: string;
  readonly publishTimestamp?: number;
  readonly source: MarketIndexSource;
  readonly engines?: MarketIndexEngines;
}

export interface MarketIndexEntryMetadata {
  readonly workbench?: boolean;
  readonly category?: string;
  readonly labels?: readonly string[];
  readonly keywords?: readonly string[];
  readonly sortKeys?: Readonly<Record<string, string | number>>;
}

export interface MarketIndexEntry {
  readonly name: string;
  readonly title?: MarketLocalizedText;
  readonly description?: MarketLocalizedText;
  readonly author?: string;
  readonly homepage?: string;
  readonly icon?: string;
  readonly metadata?: MarketIndexEntryMetadata;
  readonly versions: readonly MarketIndexVersion[];
}

export interface MarketIndexCategory {
  readonly title?: MarketLocalizedText;
}

export interface MarketIndexLabel {
  readonly title?: MarketLocalizedText;
}

export interface MarketIndexSortKey {
  readonly title?: MarketLocalizedText;
  readonly order?: 'asc' | 'desc';
}

export interface MarketIndexMetadata {
  readonly categories?: Readonly<Record<string, MarketIndexCategory>>;
  readonly labels?: Readonly<Record<string, MarketIndexLabel>>;
  readonly sortKeys?: Readonly<Record<string, MarketIndexSortKey>>;
}

export interface MarketIndex {
  readonly format: 1;
  readonly title?: MarketLocalizedText;
  readonly description?: MarketLocalizedText;
  readonly metadata?: MarketIndexMetadata;
  readonly plugins: readonly MarketIndexEntry[];
}

export type MarketIndexProblemKind =
  | 'not-json'
  | 'not-object'
  | 'format'
  | 'plugins'
  | 'plugin'
  | 'name'
  | 'duplicate-name'
  | 'versions'
  | 'version'
  | 'version-order'
  | 'source'
  | 'git-commit'
  | 'timestamp'
  | 'icon';

export interface MarketIndexProblem {
  readonly kind: MarketIndexProblemKind;
  readonly detail: string;
  readonly at?: string;
}

export type MarketIndexParse =
  | { readonly ok: true; readonly index: MarketIndex }
  | { readonly ok: false; readonly problems: readonly MarketIndexProblem[] };

export type DiscoverCompat = 'ok' | 'incompatible' | 'unknown';

export type DiscoverInstallState = 'not-installed' | 'installed' | 'update-available' | 'different-version';

export interface DiscoverVersionRow {
  readonly version: string;
  readonly publishTimestamp?: number;
  readonly source: MarketIndexSource;
  readonly engines?: MarketIndexEngines;
  readonly compat: DiscoverCompat;
  readonly peer?: string;
  readonly install: DiscoverInstallState;
}

export interface DiscoverEntry {
  readonly name: string;
  readonly title?: MarketLocalizedText;
  readonly description?: MarketLocalizedText;
  readonly author?: string;
  readonly homepage?: string;
  readonly icon?: string;
  readonly category?: string;
  readonly labels: readonly string[];
  readonly installedVersion?: string;
  readonly versions: readonly DiscoverVersionRow[];
}

export interface DiscoverSourceRow extends MarketSourceConfig {
  readonly writable: boolean | null;
}

export type DiscoverState = 'no-source' | 'ready' | 'unreadable' | 'invalid';

export interface DiscoverProblem {
  readonly kind:
    | 'no-source'
    | 'http-status'
    | 'http-network'
    | 'http-url'
    | 'git-missing'
    | 'git-network'
    | 'git-auth'
    | 'git-file'
    | 'git-empty'
    | 'git-missing-index'
    | 'format'
    | 'timeout'
    | 'unknown';
  readonly detail?: string;
  readonly branch?: string;
}

export interface DiscoverPayload {
  readonly state: DiscoverState;
  readonly sources: readonly DiscoverSourceRow[];
  readonly selected: string | null;
  readonly entries: readonly DiscoverEntry[];
  readonly fetchedAt?: number;
  readonly commit?: string;
  readonly stale?: boolean;
  readonly problem?: DiscoverProblem;
}

export interface DiscoverFilter {
  readonly query?: string;
  readonly category?: string;
  readonly label?: string;
}

export interface MarketSourcesPayload {
  readonly sources: readonly MarketSourceConfig[];
  readonly selected: string | null;
}

export interface MarketPublishDestination {
  readonly url: string;
  readonly ref?: string;
  readonly indexPath: string;
  readonly artifactPath: string;
  readonly files: readonly string[];
  readonly nextVersion?: string;
}

export interface PublishChangelog {
  readonly version: string;
  readonly text?: string;
  readonly missing?: boolean;
}

export interface PublishPreview {
  readonly name: string;
  readonly version: string;
  readonly author?: string;
  readonly registry?: string;
  readonly market?: MarketPublishDestination;
  readonly changelog?: PublishChangelog;
}

export type DiscoverDocKind = 'readme' | 'changelog';

export type DiscoverDoc =
  | {
      readonly ok: true;
      readonly kind: DiscoverDocKind;
      readonly version: string;
      readonly text: string;
    }
  | {
      readonly ok: false;
      readonly kind: DiscoverDocKind;
      readonly version: string;
      readonly reason: 'missing' | 'unavailable';
      readonly detail?: string;
    };

export type MarketSourcesAction =
  | { readonly action: 'save'; readonly source: MarketSourceConfig; readonly select?: boolean }
  | { readonly action: 'remove'; readonly id: string }
  | { readonly action: 'select'; readonly id: string | null }
  | { readonly action: 'init'; readonly id: string; readonly ref?: string; readonly stampOnly?: boolean }
  | { readonly action: 'read-only'; readonly id: string };
