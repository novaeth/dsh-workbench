import { runsRouteOf, unitFactScope } from '@dsh-workbench/shared/host';
import { MARKET_SOURCES_RESOURCE } from '@dsh-workbench/shared/contract/protocol/market-index';
import { isDependencyAction, type ProvisionAction, type ProvisionRequest } from '@dsh-workbench/shared/host';
import type { UnitCall } from '@dsh-workbench/shared/host';
import type { HandoffEntry } from '@dsh-workbench/shared/host';
import type { UnitManifest } from '@dsh-workbench/shared/host';
import { affectedUnitsOf } from './market-dependency';
import {
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_STATUS_TOOL,
  DIY_PANEL_TOOL,
  DIY_DEBUG_STOP_TOOL,
  DIY_INSTALL_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_LIST_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  DIY_RECORD_READ_TOOL,
  DIY_RECORD_DETAIL_TOOL,
  DIY_RECORD_STOP_TOOL,
  LONG_TASKS_LIST_TOOL,
  PANELS_LIST_TOOL,
} from '../unit';

export const PANELS_FACT = 'panels';
export const DIY_DEBUG_FACT = 'diy-debug';
export const DIY_RECORD_FACT = 'diy-record';
const CAPABILITY_FACT = 'capability';

const DEBUG_TOOLS: readonly string[] = [
  DIY_DEBUG_START_TOOL,
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_STOP_TOOL,
];

const RECORD_TOOLS: readonly string[] = [
  DIY_RECORD_PREPARE_TOOL,
  DIY_RECORD_READ_TOOL,
  DIY_RECORD_DETAIL_TOOL,
  DIY_RECORD_STOP_TOOL,
];

const PROVISION_TOOLS: Readonly<Record<string, ProvisionAction>> = {
  [MODULES_INSTALL_TOOL]: 'install',
  [MODULES_UPDATE_TOOL]: 'update',
  [MODULES_UNINSTALL_TOOL]: 'uninstall',
  [MODULES_UPDATE_DEPENDENCY_TOOL]: 'update-dependency',
  [DIY_INSTALL_TOOL]: 'install',
};

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function requestOf(call: UnitCall): ProvisionRequest | undefined {
  const action = PROVISION_TOOLS[call.source];
  if (action === undefined) return undefined;
  const target = textOf(call.args['unit']) || textOf(call.args['id']);
  if (target === '') return undefined;
  return isDependencyAction(action) ? { action, id: target } : { action, unit: target };
}

export function panelsHandoffEntry(target: { readonly path?: string | undefined } = {}): HandoffEntry | undefined {
  const path = textOf(target.path);
  return path === '' ? undefined : { fact: PANELS_FACT, key: `path:${path}` };
}

function listedRunUnits(result: unknown): readonly string[] {
  const outer = typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {};
  const unwrapped = outer['value'];
  const inner =
    typeof unwrapped === 'object' && unwrapped !== null ? (unwrapped as Record<string, unknown>) : outer;
  const runs = inner['runs'];
  if (!Array.isArray(runs)) return [];
  const units = new Set<string>();
  for (const row of runs) {
    const unit = typeof row === 'object' && row !== null ? (row as { unit?: unknown }).unit : undefined;
    if (typeof unit === 'string' && unit !== '') units.add(unit);
  }
  return [...units];
}

export function panelsFactsOf(
  call: UnitCall,
  manifests: readonly UnitManifest[],
): readonly string[] | undefined {
  if (call.source === PANELS_LIST_TOOL) return [PANELS_FACT];
  if (call.source === MARKET_SOURCES_RESOURCE) return [PANELS_FACT];
  if (call.source === LONG_TASKS_LIST_TOOL) return listedRunUnits(call.result).map(runsRouteOf);
  if (call.source === MODULES_LIST_TOOL) return [PANELS_FACT, CAPABILITY_FACT];
  if (call.source === MODULES_UPDATE_WORKBENCH_TOOL) return [PANELS_FACT, CAPABILITY_FACT];
  if (call.source === DIY_STATUS_TOOL || call.source === DIY_PANEL_TOOL) return [PANELS_FACT];
  if (DEBUG_TOOLS.includes(call.source)) return [DIY_DEBUG_FACT];
  if (RECORD_TOOLS.includes(call.source)) return [DIY_RECORD_FACT];
  const request = requestOf(call);
  if (request === undefined) return undefined;
  return [
    PANELS_FACT,
    CAPABILITY_FACT,
    ...affectedUnitsOf(manifests, request).map(unitFactScope),
  ];
}
