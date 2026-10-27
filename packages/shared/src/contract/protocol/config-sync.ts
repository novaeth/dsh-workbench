export const CONFIG_SYNC_ROUTE = 'config-sync';

export const CONFIG_SYNC_RESOURCE = 'configSync';

export type ConfigSyncState = 'new' | 'differs';

export interface ConfigSyncRow {
  readonly key: string;
  readonly id: string;
  readonly state: ConfigSyncState;
  readonly body: string;
  readonly ownBody: string | null;
  readonly missing: readonly string[];
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
  readonly verified: boolean;
}

export interface ConfigSyncRequest {
  readonly source: string;
  readonly keys: readonly string[];
  readonly overwrite: readonly string[];
}
