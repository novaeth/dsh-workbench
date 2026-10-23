import { useCallback, useEffect, useRef, useState } from 'react';

import type { UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import { capabilityOutdated, mergeTitles } from './market-rows';
import type { MarketRow, MarketRowAction, ModuleUpdateMap } from './market-rows';
import type { SharedRow } from './market-shared-rows';
import { MODULE_SETTLE_MS, settleLanded } from './market-settle';

export const PROGRESS_KEY: Readonly<Record<MarketRowAction, string>> = {
  install: 'panels.market.installing',
  update: 'panels.market.updating',
  'update-bundle': 'panels.market.updating',
  'remove-bundle': 'panels.market.uninstalling',
  uninstall: 'panels.market.uninstalling',
  'update-dependency': 'panels.market.updating',
  'update-plugin': 'panels.market.updating',
  'uninstall-plugin': 'panels.market.uninstalling',
  'update-workbench': 'panels.market.updating',
};

export const ACTION_LABEL_KEY: Readonly<Record<MarketRowAction, string>> = {
  install: 'panels.market.install',
  update: 'panels.market.update',
  'update-bundle': 'panels.market.update',
  'remove-bundle': 'panels.market.uninstall',
  uninstall: 'panels.market.uninstall',
  'update-dependency': 'panels.market.update',
  'update-plugin': 'panels.market.update',
  'uninstall-plugin': 'panels.market.uninstall',
  'update-workbench': 'panels.market.update',
};

export interface HeldRow {
  readonly id: string;
  readonly row: MarketRow;
}

export interface Pending {
  readonly id: string;
  readonly action: MarketRowAction;
  readonly titleKey?: string | undefined;
  readonly label?: string | undefined;
  readonly pkg?: string | undefined;
  readonly version?: string | undefined;
  readonly latest?: string | undefined;
  readonly since?: number | undefined;
  readonly row?: MarketRow | undefined;
  readonly until?: string | undefined;
  readonly readBack?: boolean | undefined;
}

export function holdOf(pending: Pending | null, application: string | undefined): HeldRow | undefined {
  if (pending === null || pending.row === undefined) return undefined;
  if (application !== 'applied') return undefined;
  return { id: pending.id, row: pending.row };
}

export function pendingLanded(
  pending: Pending | null,
  updates: ModuleUpdateMap,
  capabilities: CapabilityMap | null,
  installed: string | undefined,
  shared: readonly SharedRow[] = [],
  plugins: readonly MarketRow[] | null = null,
): boolean {
  if (pending === null) return true;
  if (pending.action === 'update' && capabilities === null) return false;
  return settleLanded({
    action: pending.action,
    until: pending.until,
    readBack: pending.readBack,
    installed,
    entry: updates[pending.id],
    clicked: pending.version,
    outdated: capabilityOutdated(capabilities, pending.id),
    ...(pending.action === 'update-dependency'
      ? { sharedState: shared.find((row) => row.id === pending.id)?.state }
      : {}),
    ...(pending.action === 'update-plugin'
      ? {
          pluginOutdated:
            plugins === null ? null : (plugins.find((row) => row.id === pending.id)?.canUpdate ?? false),
        }
      : {}),
  });
}

export function holdExpired(
  held: HeldRow | undefined,
  backInRoster: boolean,
  elapsedMs: number,
): boolean {
  if (held === undefined) return true;
  return backInRoster || elapsedMs >= MODULE_SETTLE_MS;
}

export function heldIdOf(pending: Pending | null, held: HeldRow | undefined): string | null {
  return pending?.id ?? held?.id ?? null;
}

export function pinnedRowOf(
  pending: Pending | null,
  held: HeldRow | undefined,
): MarketRow | undefined {
  return pending?.row ?? held?.row;
}

export function withPinnedRow(
  rows: readonly MarketRow[],
  pinned: MarketRow | undefined,
): MarketRow[] {
  if (pinned === undefined) return [...rows];
  if (!rows.some((row) => row.id === pinned.id)) return [...rows, pinned];
  return rows.map((row) => (row.id === pinned.id ? pinned : row));
}

export function marketFootVisible(
  shown: readonly MarketRow[],
  installed: readonly MarketRow[],
): boolean {
  return shown.length > 0 || installed.length > 0;
}

export function useMarketTitles(
  manifests: readonly UnitManifest[],
  mocked: boolean,
): ReadonlyMap<string, string> {
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    if (!mocked) setTitles((known) => mergeTitles(known, manifests));
  }, [manifests, mocked]);
  return titles;
}

export interface HeldRowControl {
  readonly held: HeldRow | undefined;
  hold(next: HeldRow | undefined): void;
}

export function useHeldRow(
  pending: Pending | null,
  backInRoster: (id: string) => boolean,
): HeldRowControl {
  const [held, setHeld] = useState<HeldRow | undefined>(undefined);
  const heldAtRef = useRef(0);
  const hold = useCallback((next: HeldRow | undefined): void => {
    if (next !== undefined) heldAtRef.current = Date.now();
    setHeld(next);
  }, []);
  const back = held === undefined ? false : backInRoster(held.id);
  useEffect(() => {
    if (held === undefined) return;
    if (holdExpired(held, back, Date.now() - heldAtRef.current)) {
      setHeld(undefined);
      return;
    }
    const timer = setTimeout(() => setHeld(undefined), MODULE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [held, back]);
  useEffect(() => {
    if (pending !== null) setHeld(undefined);
  }, [pending]);
  return { held, hold };
}

export function removingIdOf(
  pending: Pending | null,
  failed: { readonly id: string } | null,
): string | null {
  if (pending === null || pending.action !== 'remove-bundle') return null;
  return failed?.id === pending.id ? null : pending.id;
}

export function pendingRowOf(input: {
  readonly pending: Pending | null;
  readonly removing: string | null;
  readonly rows: readonly MarketRow[];
  readonly titles: ReadonlyMap<string, string>;
}): MarketRow | undefined {
  const { pending, removing } = input;
  if (removing === null || pending === null) return undefined;
  if (input.rows.some((row) => row.id === removing)) return undefined;
  return {
    id: removing,
    titleKey: pending.titleKey ?? input.titles.get(removing) ?? removing,
    ...(pending.label === undefined ? {} : { label: pending.label }),
    state: 'installed',
    canInstall: false,
    canUpdate: false,
    canUninstall: true,
    ...(pending.pkg === undefined ? {} : { pkg: pending.pkg }),
    ...(pending.version === undefined ? {} : { version: { installed: pending.version } }),
  };
}
