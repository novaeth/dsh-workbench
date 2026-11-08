export const PANELS_ROUTE = 'panels';

export const DIY_DEBUG_ROUTE = 'panels/diy-debug';

export const DIY_RECORD_ROUTE = 'panels/diy-record';

export type PanelSource = 'default' | 'user';

export interface PanelUnitView {
  readonly id: string;
  readonly titleKey: string;
  readonly shown: boolean;
  readonly source: PanelSource;
  readonly hasCard: boolean;
}

export interface PanelPluginView {
  readonly id: string;
  readonly pkg: string;
  readonly title: string;
  readonly name?: string | undefined;
  readonly shown: boolean;
  readonly source: PanelSource;
}

export interface PanelsPayload {
  readonly ok: true;
  readonly units: readonly PanelUnitView[];
  readonly plugins: readonly PanelPluginView[];
  readonly defaults: readonly string[];
  readonly own: boolean;
  readonly changed: Readonly<Record<string, number>>;
}
