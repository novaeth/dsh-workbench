export const WORKBENCH_SETTINGS_ROUTE = 'workbench-settings';

export const WORKBENCH_SETTINGS_RESOURCE = 'workbenchSettings';

export interface WorkbenchSettings {
  readonly mcpOnDemand: boolean;
}

export interface WorkbenchSettingsSnapshot {
  readonly settings: WorkbenchSettings;
}

export interface WorkbenchSettingsApplied {
  readonly ok: true;
  readonly settings: WorkbenchSettings;
}

export interface WorkbenchSettingsRequest {
  readonly mcpOnDemand?: boolean;
}
