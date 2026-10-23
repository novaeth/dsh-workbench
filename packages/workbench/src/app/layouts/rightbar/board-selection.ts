import type { ModuleSummary } from '@dsh-workbench/shared';
import type { BoardModule } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import type { PanelPluginUnit, PanelUnit } from './use-panels';

export interface SelectableUnit {
  readonly id: string;
  readonly shown: boolean;
}

export interface PanelRow {
  readonly id: string;
  readonly titleKey?: string;
  readonly title?: string;
  readonly plugin: boolean;
  readonly hasCard?: boolean;
  readonly badgeKey?: string;
  readonly shown: boolean;
  readonly source: 'default' | 'user';
}

export function available(capability: CapabilityMap[string] | undefined): boolean {
  if (capability === undefined) return true;
  if (capability.released === true) return false;
  return capability.status === 'ok' || capability.status === 'unchecked' || capability.status === 'failed';
}

export function selectPanelUnits<T extends SelectableUnit>(
  units: readonly T[],
  capabilities: CapabilityMap | null,
): T[] {
  return units.filter((unit) => available(capabilities?.[unit.id]));
}

export function panelDropTarget(
  rows: readonly { readonly shown: boolean; readonly hasCard?: boolean }[],
  index: number | null,
): number | null {
  if (index === null) return null;
  const row = rows[index];
  return row?.shown === true && row.hasCard !== false ? index : null;
}

export function rowAtPoint(
  boxes: readonly { readonly top: number; readonly bottom: number }[],
  y: number,
): number | null {
  const last = boxes.length - 1;
  for (let at = 0; at <= last; at += 1) {
    const box = boxes[at];
    const next = boxes[at + 1];
    if (box === undefined) continue;
    const end = next === undefined ? box.bottom : next.top;
    if (y >= box.top && (next === undefined ? y <= end : y < end)) return at;
  }
  return null;
}

export function panelBadgeKey(capability: CapabilityMap[string] | undefined): string | undefined {
  if (capability === undefined || capability.status === 'ok') return undefined;
  if (capability.status === 'failed') return 'panels.dep.failed';
  if (capability.status === 'missing-plugin') return 'panels.dep.missingPlugin';
  if (capability.status === 'missing-commands') return 'panels.dep.missingCommands';
  return 'panels.dep.unchecked';
}

function moduleRow(unit: PanelUnit, capability: CapabilityMap[string] | undefined): PanelRow {
  const badge = panelBadgeKey(capability);
  return {
    id: unit.id,
    titleKey: unit.titleKey,
    plugin: false,
    hasCard: unit.hasCard,
    ...(badge === undefined ? {} : { badgeKey: badge }),
    shown: unit.shown,
    source: unit.source,
  };
}

function pluginRow(plugin: PanelPluginUnit): PanelRow {
  return {
    id: plugin.id,
    title: plugin.title,
    plugin: true,
    shown: plugin.shown,
    source: plugin.source,
  };
}

export function selectPanelRows(
  units: readonly PanelUnit[],
  plugins: readonly PanelPluginUnit[],
  capabilities: CapabilityMap | null,
): PanelRow[] {
  const listed = new Set(plugins.map((plugin) => plugin.id));
  return [
    ...selectPanelUnits(units, capabilities)
      .filter((unit) => !listed.has(unit.id))
      .map((unit) => moduleRow(unit, capabilities?.[unit.id])),
    ...plugins.map(pluginRow),
  ];
}

export function selectBoardModules(
  units: readonly SelectableUnit[] | null,
  byId: (id: string) => BoardModule | undefined,
  capabilities: CapabilityMap | null,
): BoardModule[] {
  if (units === null) return [];
  return units
    .filter((unit) => unit.shown && available(capabilities?.[unit.id]))
    .map((unit) => byId(unit.id))
    .filter((module): module is BoardModule => module !== undefined);
}

export function aggregateSummaries(
  summaries: readonly ModuleSummary[],
): { readonly refreshing: boolean; readonly at: number | null } {
  const refreshing = summaries.some((item) => item.refreshing);
  const times = summaries.map((item) => item.at).filter((value): value is number => value !== null);
  return { refreshing, at: times.length === 0 ? null : Math.max(...times) };
}
