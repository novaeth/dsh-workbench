export const CONFIG_SYNC_ROUTE = 'config-sync';

export const CONFIG_SYNC_RESOURCE = 'configSync';

export type ConfigSyncState = 'new' | 'differs' | 'same';

export type ConfigSyncAssetState = 'missing' | 'differs' | 'same' | 'external';

export interface ConfigSyncAssetFile {
  readonly path: string;
  readonly state: ConfigSyncAssetState;
  readonly bytes: number | null;
}

export interface ConfigSyncAsset {
  readonly key: string;
  readonly path: string;
  readonly kind: 'file' | 'dir';
  readonly state: ConfigSyncAssetState;
  readonly files: readonly ConfigSyncAssetFile[];
  readonly bytes: number;
  readonly reason?: string;
}

export interface ConfigSyncRow {
  readonly key: string;
  readonly id: string;
  readonly insert: boolean;
  readonly state: ConfigSyncState;
  readonly body: string;
  readonly ownBody: string | null;
  readonly missing: readonly string[];
  readonly assets: readonly ConfigSyncAsset[];
}

export interface ConfigSyncProfile {
  readonly name: string;
  readonly readable: boolean;
  readonly candidates: number;
}

export interface ConfigSyncSnapshot {
  readonly self: string;
  readonly home: string;
  readonly source: string;
  readonly profiles: readonly ConfigSyncProfile[];
  readonly rows: readonly ConfigSyncRow[];
  readonly emptyProviders: boolean;
  readonly reason?: string;
}

export interface ConfigSyncApplied {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  readonly files: readonly string[];
  readonly verified: boolean;
}

export interface ConfigSyncRequest {
  readonly source: string;
  readonly keys: readonly string[];
  readonly overwrite: readonly string[];
  readonly assets?: readonly string[];
  readonly overwriteAssets?: readonly string[];
}
