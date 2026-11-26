import type { UnitManifest } from '@dsh-workbench/shared';

export const PANELS_MODULE_ID = 'panels';

export const PANELS_LIST_TOOL = 'workbench_panels_list';
export const PANELS_SHOW_TOOL = 'workbench_panels_show';
export const PANELS_HIDE_TOOL = 'workbench_panels_hide';
export const PANELS_MOVE_TOOL = 'workbench_panels_move';
export const PANELS_RESET_TOOL = 'workbench_panels_reset';
export const PANELS_FOLLOW_TOOL = 'workbench_panels_follow';

export const MODULES_LIST_TOOL = 'workbench_modules_list';
export const MODULES_INSTALL_TOOL = 'workbench_modules_install';
export const MODULES_UPDATE_TOOL = 'workbench_modules_update';
export const MODULES_UNINSTALL_TOOL = 'workbench_modules_uninstall';
export const MODULES_INSTALL_BUNDLE_TOOL = 'workbench_modules_install_bundle';
export const MODULES_UPDATE_DEPENDENCY_TOOL = 'workbench_modules_update_dependency';
export const MODULES_UPDATE_PLUGIN_TOOL = 'workbench_modules_update_plugin';
export const MODULES_UNINSTALL_PLUGIN_TOOL = 'workbench_modules_uninstall_plugin';
export const MODULES_UPDATE_WORKBENCH_TOOL = 'workbench_modules_update_workbench';
export const MARKET_SOURCES_TOOL = 'workbench_market_sources';
export const MARKET_CATEGORIES_TOOL = 'workbench_market_categories';
export const MARKET_ENABLE_TOOL = 'workbench_market_enable';
export const MARKET_DISABLE_TOOL = 'workbench_market_disable';

export const DIY_STATUS_TOOL = 'workbench_diy_status';
export const DIY_PLAN_TOOL = 'workbench_diy_plan';
export const DIY_STEP_TOOL = 'workbench_diy_step';
export const DIY_PANEL_TOOL = 'workbench_diy_panel';
export const DIY_SURFACE_TOOL = 'workbench_diy_surface';
export const DIY_RECON_TOOL = 'workbench_diy_recon';
export const DIY_SPEC_TOOL = 'workbench_diy_spec';
export const DIY_INSTALL_TOOL = 'workbench_diy_install';
export const DIY_PUBLISH_TOOL = 'workbench_diy_publish';
export const DIY_SHOW_TOOL = 'workbench_diy_show';
export const DIY_STATE_TOOL = 'workbench_diy_state';
export const DIY_HTML_TOOL = 'workbench_diy_html';
export const DIY_FIND_TOOL = 'workbench_diy_find';
export const DIY_CLICK_TOOL = 'workbench_diy_click';
export const DIY_HOVER_TOOL = 'workbench_diy_hover';
export const DIY_TYPE_TOOL = 'workbench_diy_type';
export const DIY_FILL_TOOL = 'workbench_diy_fill';
export const DIY_KEYS_TOOL = 'workbench_diy_keys';
export const DIY_SCROLL_TOOL = 'workbench_diy_scroll';
export const DIY_WAIT_TOOL = 'workbench_diy_wait';
export const DIY_EVAL_TOOL = 'workbench_diy_eval';
export const DIY_SCREENSHOT_TOOL = 'workbench_diy_screenshot';
export const DIY_NETWORK_TOOL = 'workbench_diy_network';
export const DIY_DIALOG_TOOL = 'workbench_diy_dialog';
export const DIY_LOGS_WATCH_TOOL = 'workbench_diy_logs_watch';
export const DIY_LOGS_READ_TOOL = 'workbench_diy_logs_read';
export const DIY_LOGS_STOP_TOOL = 'workbench_diy_logs_stop';

export const DIY_RECORD_PREPARE_TOOL = 'workbench_diy_record_prepare';
export const DIY_RECORD_READ_TOOL = 'workbench_diy_record_read';
export const DIY_RECORD_DETAIL_TOOL = 'workbench_diy_record_detail';
export const DIY_RECORD_STOP_TOOL = 'workbench_diy_record_stop';

export const LONG_TASKS_LIST_TOOL = 'workbench_long_tasks_list';
export const LONG_TASKS_STOP_TOOL = 'workbench_long_tasks_stop';

export const TOOLBOX_LIST_TOOL = 'workbench_toolbox_list';
export const TOOLBOX_OPEN_TOOL = 'workbench_toolbox_open';
export const TOOLBOX_CLOSE_TOOL = 'workbench_toolbox_close';

export const DIAG_TOOL = 'workbench_diag';

export const TOOLBOX_TOOLS = [TOOLBOX_LIST_TOOL, TOOLBOX_OPEN_TOOL, TOOLBOX_CLOSE_TOOL] as const;

export const PACK_TARGET_LIMIT = 8;

export const DIY_DEBUG_START_TOOL = 'workbench_diy_debug_start';
export const DIY_DEBUG_PAUSE_TOOL = 'workbench_diy_debug_pause';
export const DIY_DEBUG_RESUME_TOOL = 'workbench_diy_debug_resume';
export const DIY_DEBUG_STOP_TOOL = 'workbench_diy_debug_stop';

const PAGE_TOOLS = [
  DIY_STATE_TOOL,
  DIY_HTML_TOOL,
  DIY_FIND_TOOL,
  DIY_CLICK_TOOL,
  DIY_HOVER_TOOL,
  DIY_TYPE_TOOL,
  DIY_FILL_TOOL,
  DIY_KEYS_TOOL,
  DIY_SCROLL_TOOL,
  DIY_WAIT_TOOL,
  DIY_EVAL_TOOL,
  DIY_SCREENSHOT_TOOL,
  DIY_NETWORK_TOOL,
  DIY_DIALOG_TOOL,
  DIY_LOGS_WATCH_TOOL,
  DIY_LOGS_READ_TOOL,
  DIY_LOGS_STOP_TOOL,
] as const;

const DIY_FLOW_FAMILY = [DIY_STATUS_TOOL, DIY_PLAN_TOOL, DIY_STEP_TOOL, DIY_PANEL_TOOL, DIY_SURFACE_TOOL] as const;
const DIY_PROBE_FAMILY = [DIY_RECON_TOOL, DIY_SPEC_TOOL] as const;
const DIY_BUILD_FAMILY = [DIY_INSTALL_TOOL, DIY_PUBLISH_TOOL, DIY_SHOW_TOOL] as const;
const DIY_LOGS_FAMILY = [DIY_LOGS_WATCH_TOOL, DIY_LOGS_READ_TOOL, DIY_LOGS_STOP_TOOL] as const;

export const DIY_TOOLS = [
  ...DIY_FLOW_FAMILY,
  ...DIY_PROBE_FAMILY,
  ...DIY_BUILD_FAMILY,
  ...PAGE_TOOLS,
] as const;

export const DIY_FLOW_TOOLS = [...DIY_FLOW_FAMILY, MODULES_LIST_TOOL] as const;

export const DIY_PROBE_TOOLS = DIY_PROBE_FAMILY;

export const DIY_PAGE_TOOLS = PAGE_TOOLS;

export const DIY_BUILD_TOOLS = [
  ...DIY_BUILD_FAMILY,
  PANELS_HIDE_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_UNINSTALL_TOOL,
  LONG_TASKS_LIST_TOOL,
  LONG_TASKS_STOP_TOOL,
] as const;

export const RESIDENT_TOOLS = [...TOOLBOX_TOOLS, DIAG_TOOL] as const;

export const ALL_TOOLS = [
  DIAG_TOOL,
  TOOLBOX_LIST_TOOL,
  TOOLBOX_OPEN_TOOL,
  TOOLBOX_CLOSE_TOOL,
  PANELS_LIST_TOOL,
  PANELS_SHOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_FOLLOW_TOOL,
  MODULES_LIST_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_UPDATE_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
  MARKET_SOURCES_TOOL,
  MARKET_CATEGORIES_TOOL,
  MARKET_ENABLE_TOOL,
  MARKET_DISABLE_TOOL,
  ...DIY_TOOLS,
  DIY_RECORD_PREPARE_TOOL,
  DIY_RECORD_READ_TOOL,
  DIY_RECORD_DETAIL_TOOL,
  DIY_RECORD_STOP_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_STOP_TOOL,
  LONG_TASKS_LIST_TOOL,
  LONG_TASKS_STOP_TOOL,
] as const;

export type PanelsToolName = (typeof ALL_TOOLS)[number];

export const READ_TOOLS = [
  DIAG_TOOL,
  DIY_STEP_TOOL,
  TOOLBOX_LIST_TOOL,
  TOOLBOX_OPEN_TOOL,
  TOOLBOX_CLOSE_TOOL,
  PANELS_LIST_TOOL,
  MODULES_LIST_TOOL,
  MARKET_SOURCES_TOOL,
  MARKET_CATEGORIES_TOOL,
  DIY_STATUS_TOOL,
  DIY_PANEL_TOOL,
  DIY_SURFACE_TOOL,
  DIY_RECON_TOOL,
  DIY_SPEC_TOOL,
  ...PAGE_TOOLS,
  DIY_RECORD_READ_TOOL,
  DIY_RECORD_DETAIL_TOOL,
  DIY_RECORD_STOP_TOOL,
  LONG_TASKS_LIST_TOOL,
] as const satisfies readonly PanelsToolName[];

const PANEL_WRITE_FAMILY = [
  PANELS_SHOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_FOLLOW_TOOL,
] as const;
const MODULE_WRITE_FAMILY = [
  MODULES_INSTALL_TOOL,
  MODULES_UPDATE_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
] as const;
const MARKET_WRITE_FAMILY = [MARKET_ENABLE_TOOL, MARKET_DISABLE_TOOL] as const;

export const WRITE_TOOLS = [
  DIY_PLAN_TOOL,
  ...PANEL_WRITE_FAMILY,
  ...MODULE_WRITE_FAMILY,
  ...MARKET_WRITE_FAMILY,
  DIY_INSTALL_TOOL,
  DIY_PUBLISH_TOOL,
  DIY_SHOW_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_STOP_TOOL,
  LONG_TASKS_STOP_TOOL,
] as const satisfies readonly PanelsToolName[];

type Classified = (typeof READ_TOOLS)[number] | (typeof WRITE_TOOLS)[number];
type Unclassified = Exclude<PanelsToolName, Classified>;
type InBothLists = Extract<(typeof READ_TOOLS)[number], (typeof WRITE_TOOLS)[number]>;

const EVERY_TOOL_CLASSIFIED: Unclassified extends never ? true : never = true;
const NO_TOOL_IN_BOTH_LISTS: InBothLists extends never ? true : never = true;
void EVERY_TOOL_CLASSIFIED;
void NO_TOOL_IN_BOTH_LISTS;


export const DIY_RECORD_TOOLS = [
  DIY_RECORD_PREPARE_TOOL,
  DIY_RECORD_READ_TOOL,
  DIY_RECORD_DETAIL_TOOL,
  DIY_RECORD_STOP_TOOL,
] as const satisfies readonly PanelsToolName[];

export const DIY_DEBUG_TOOLS = [
  DIY_DEBUG_START_TOOL,
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_STOP_TOOL,
] as const satisfies readonly PanelsToolName[];

export const DIY_LOGS_TOOLS = DIY_LOGS_FAMILY;

export const MANAGE_TOOLS = [
  PANELS_LIST_TOOL,
  ...PANEL_WRITE_FAMILY,
  MODULES_LIST_TOOL,
  ...MODULE_WRITE_FAMILY,
  MARKET_SOURCES_TOOL,
  MARKET_CATEGORIES_TOOL,
  ...MARKET_WRITE_FAMILY,
  LONG_TASKS_LIST_TOOL,
  LONG_TASKS_STOP_TOOL,
] as const satisfies readonly PanelsToolName[];

export const DIY_BORROWED_TOOLS = [
  PANELS_HIDE_TOOL,
  MODULES_LIST_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_UNINSTALL_TOOL,
  LONG_TASKS_LIST_TOOL,
  LONG_TASKS_STOP_TOOL,
] as const satisfies readonly PanelsToolName[];

export const DIY_PACK_TOOLS = [
  ...DIY_TOOLS,
  ...DIY_RECORD_TOOLS,
  ...DIY_DEBUG_TOOLS,
  ...DIY_BORROWED_TOOLS,
] as const satisfies readonly PanelsToolName[];

type PackAssigned =
  | (typeof RESIDENT_TOOLS)[number]
  | (typeof MANAGE_TOOLS)[number]
  | (typeof DIY_PACK_TOOLS)[number];
type Unassigned = Exclude<PanelsToolName, PackAssigned>;
type BorrowedOutsideDiy = Exclude<(typeof DIY_BORROWED_TOOLS)[number], (typeof DIY_PACK_TOOLS)[number]>;

const EVERY_TOOL_IN_ONE_PACK: Unassigned extends never ? true : never = true;
const DIY_PACK_CARRIES_WHAT_IT_BORROWS: BorrowedOutsideDiy extends never ? true : never = true;
void EVERY_TOOL_IN_ONE_PACK;
void DIY_PACK_CARRIES_WHAT_IT_BORROWS;

export function screenOnlyToolsFor(pageDebug: boolean): readonly PanelsToolName[] {
  return pageDebug ? [] : [...DIY_DEBUG_TOOLS, ...DIY_LOGS_TOOLS];
}

export const panelsUnit: UnitManifest = {
  id: PANELS_MODULE_ID,
  titleKey: `${PANELS_MODULE_ID}.title`,
  card: null,
  tools: [
    ...READ_TOOLS.map((name) => ({ name, writes: false })),
    ...WRITE_TOOLS.map((name) => ({ name, writes: true })),
  ],
  host: {
    inject: [],
    optional: ['tools', 'workbenchSeam'],
  },
};
