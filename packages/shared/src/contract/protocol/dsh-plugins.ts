export const DSH_PLUGINS_ROUTE = 'dsh-plugins';

export interface DshPluginRow {
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
}

export interface DshPluginsSnapshot {
  readonly available: boolean;
  readonly bundles: readonly DshPluginRow[];
  readonly plugins: readonly DshPluginRow[];
}
