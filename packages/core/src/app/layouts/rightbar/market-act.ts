import type { Translate, WriteOutcome } from '@dsh-workbench/shared';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { MarketRow } from './market-row-types';
import { marketRowTitle, type MarketRowAction } from './market-rows';
import { installedPluginNotice } from './market-plugin-rows';
import { changeFailure, changeOf } from './market-change';
import { updateVerdictOf, updateVerdictText, type UpdatedModule } from './market-update-verdict';
import { holdOf, type HeldRow, type Pending } from './market-view-text';
import { awaitsReadBack, swapUntil } from './market-settle';

const STEADY_ACTIONS: ReadonlySet<MarketRowAction> = new Set<MarketRowAction>([
  'update',
  'update-bundle',
]);

function recordOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

function moduleOf(value: unknown): UpdatedModule | undefined {
  const module = recordOf(recordOf(value)?.module);
  if (module === undefined) return undefined;
  return {
    ...(typeof module.kind === 'string' ? { kind: module.kind } : {}),
    ...(typeof module.pkg === 'string' ? { pkg: module.pkg } : {}),
    ...(typeof module.version === 'string' ? { version: module.version } : {}),
  };
}

function restoredOf(value: unknown): string | undefined {
  const restored = recordOf(value)?.restored;
  return typeof restored === 'string' && restored !== '' ? restored : undefined;
}

export interface MarketActSeats {
  readonly setPending: (next: Pending | null) => void;
  readonly setHeld: (next: HeldRow | undefined) => void;
  readonly setConfirming: (next: string | null) => void;
  readonly setFailed: (next: { readonly id: string; readonly message: string } | null) => void;
  readonly setNotice: (next: string | null) => void;
}

export interface MarketActOptions {
  readonly t: Translate;
  readonly mocked: boolean;
  readonly rowOf: (id: string) => MarketRow | undefined;
  readonly seats: MarketActSeats;
  readonly send: (body: Record<string, unknown>) => Promise<WriteOutcome<unknown>>;
  readonly onChanged: (options?: { readonly force?: boolean }) => void;
}

export function marketActOf(options: MarketActOptions): (id: string, action: MarketRowAction) => Promise<void> {
  const { t, mocked, rowOf, seats, send, onChanged } = options;
  return async (id, action) => {
    if (mocked) return;
    const row = rowOf(id);
    const label = row === undefined ? undefined : marketRowTitle(row, t);
    const next: Pending = {
      id,
      action,
      since: Date.now(),
      ...(row?.titleKey === undefined ? {} : { titleKey: row.titleKey }),
      ...(label === undefined ? {} : { label }),
      ...(row?.pkg === undefined ? {} : { pkg: row.pkg }),
      ...(row?.version?.installed === undefined ? {} : { version: row.version.installed }),
      ...(row?.version?.latest === undefined ? {} : { latest: row.version.latest }),
      ...(row === undefined || !STEADY_ACTIONS.has(action)
        ? {}
        : { row: label === undefined ? row : { ...row, label } }),
    };
    seats.setPending(next);
    seats.setConfirming(null);
    seats.setFailed(null);
    if (action !== 'uninstall-plugin') seats.setNotice(null);
    const dependency = action === 'update-dependency';
    const byName =
      action === 'remove-bundle' ||
      action === 'update-plugin' ||
      action === 'uninstall-plugin' ||
      action === 'update-workbench';
    const outcome = await send(
      dependency ? { action, id } : byName ? { action, name: row?.pkg ?? '' } : { action, unit: id },
    );
    if (!outcome.ok) {
      onChanged({ force: true });
      seats.setPending(null);
      seats.setHeld(undefined);
      seats.setFailed({ id, message: t('panels.market.failed', { reason: outcome.message }) });
      return;
    }
    const value = outcome.value;
    const change: BundleChange | undefined = changeOf(value);
    const verdict = updateVerdictOf({
      action,
      change,
      module: moduleOf(value),
      restored: restoredOf(value),
      clicked: next.version,
      latest: next.latest,
    });
    const failure = updateVerdictText(verdict, t, {
      ...(next.version === undefined ? {} : { from: next.version }),
      ...(next.latest === undefined ? {} : { latest: next.latest }),
    });
    onChanged({ force: true });
    if (failure !== undefined) {
      seats.setPending(null);
      seats.setHeld(undefined);
      seats.setFailed({ id, message: failure });
      return;
    }
    const until = swapUntil(action, change?.application, next.latest);
    const application =
      change?.application ??
      (action === 'update' || action === 'update-dependency' || action === 'update-plugin'
        ? 'applied'
        : undefined);
    const readBack = awaitsReadBack(action, application, next.version);
    seats.setPending(
      until === undefined && !readBack
        ? null
        : {
            ...next,
            ...(until === undefined ? {} : { until }),
            ...(readBack ? { readBack: true } : {}),
          },
    );
    seats.setHeld(readBack ? undefined : holdOf(next, change?.application));
    if (action === 'uninstall-plugin') seats.setNotice(installedPluginNotice(value, t));
    const reason = changeFailure(change, t);
    if (reason !== undefined) seats.setFailed({ id, message: t('panels.market.failed', { reason }) });
  };
}
