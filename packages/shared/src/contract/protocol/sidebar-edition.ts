export const SIDEBAR_EDITION_ROUTE = 'sidebar-edition';

export const SIDEBAR_EDITION_RESOURCE = 'sidebarEdition';

export type SidebarEdition = 'official' | 'custom';

export interface SidebarEditionSnapshot {
  readonly edition: SidebarEdition;
}

export interface SidebarEditionApplied {
  readonly ok: true;
  readonly edition: SidebarEdition;
  readonly reloadRequired: boolean;
}

export interface SidebarEditionRequest {
  readonly edition: SidebarEdition;
}
