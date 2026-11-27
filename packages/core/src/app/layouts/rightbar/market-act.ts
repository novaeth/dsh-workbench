import { marketInstallTarget } from '@dsh-workbench/shared';
import type { Translate, WriteOutcome } from '@dsh-workbench/shared';
import type { BundleChange } from '@/kernel/contract/bundle-install';
import type { MarketFailure, MarketRow } from './market-row-types';
import { marketRowTitle, type MarketRowAction } from './market-rows';
import { changeFailure, changeOf } from './market-change';
import { installCardOf, updateStuckCardOf } from './failure-card-text';
import { updateVerdictOf, updateVerdictText, type UpdatedModule } from './market-update-verdict';
import { holdOf, type HeldRow, type Pending } from './market-view-text';
import { REMOVAL_ACTIONS, awaitsReadBack, swapUntil } from './market-settle';
import type { MarketReloadOptions } from '../market/use-market-reload';

const STEADY_ACTIONS: ReadonlySet<MarketRowAction> = new Set<MarketRowAction>([
  'update',
  'update-bundle',
  'install-version',
]);

function assumedApplied(action: MarketRowAction): boolean {
  return (
    action === 'update' ||
    action === 'update-dependency' ||
    action === 'update-plugin' ||
    REMOVAL_ACTIONS.has(action)
  );
}

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

function remedyOf(value: unknown): { readonly command: string } | undefined {
  const command = recordOf(recordOf(value)?.remedy)?.command;
  return typeof command === 'string' && command !== '' ? { command } : undefined;
}

export interface MarketActSeats {
  readonly setPending: (next: Pending | null) => void;
  readonly setHeld: (next: HeldRow | undefined) => void;
  readonly setConfirming: (next: string | null) => void;
  readonly setFailed: (next: MarketFailure | null) => void;
  readonly setNotice: (next: string | null) => void;
}

export interface MarketActOptions {
  readonly t: Translate;
  readonly rowOf: (id: string) => MarketRow | undefined;
  readonly seats: MarketActSeats;
  readonly send: (body: Record<string, unknown>) => Promise<WriteOutcome<unknown>>;
  readonly onChanged: (options?: MarketReloadOptions) => void;
}

export interface MarketActRunOptions {
  readonly approvedBuilds?: readonly string[] | undefined;
}

export interface MarketAct {
  (id: string, action: MarketRowAction, options?: MarketActRunOptions): Promise<void>;
  many(ids: readonly string[], action: MarketRowAction): Promise<void>;
}

export function marketActOf(options: MarketActOptions): MarketAct {
  const { t, rowOf, seats, send, onChanged } = options;
  let quiet = false;
  const changed = (reload?: MarketReloadOptions): void => {
    if (!quiet) onChanged(reload);
  };
  const act = async (id: string, action: MarketRowAction, options?: MarketActRunOptions): Promise<void> => {
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
    seats.setNotice(null);
    const dependency = action === 'update-dependency';
    const byName =
      action === 'remove-bundle' ||
      action === 'update-plugin' ||
      action === 'uninstall-plugin' ||
      action === 'update-workbench' ||
      action === 'migrate-workbench';
    const market = action === 'install-version' ? row?.market : undefined;
    const marketSpec =
      market === undefined || row?.pkg === undefined
        ? undefined
        : marketInstallTarget(row.pkg, market.version, market.source).spec;
    const spec = (action === 'install-version' ? row?.reinstall : undefined) ?? marketSpec;
    if (action === 'install-version' && spec === undefined) {
      seats.setPending(null);
      seats.setFailed({ id, message: t('panels.market.failed', { reason: t('panels.market.noMarketSource') }) });
      return;
    }
    const builds = options?.approvedBuilds === undefined ? {} : { approvedBuilds: [...options.approvedBuilds] };
    const outcome = await send(
      action === 'dismiss-followup'
        ? { action, id: row?.followUp?.id ?? '', ...builds }
        : dependency
          ? { action, id, ...builds }
          : byName
            ? {
                action,
                name: row?.pkg ?? '',
                ...builds,
              }
            : spec === undefined
              ? { action, unit: id, ...builds }
              : {
                  action,
                  spec,
                  requestId: globalThis.crypto.randomUUID(),
                  ...(market?.route === undefined ? {} : { route: market.route }),
                  ...builds,
                },
    );
    if (!outcome.ok) {
      changed({ force: true });
      seats.setPending(null);
      seats.setHeld(undefined);
      seats.setFailed({
        id,
        message: t('panels.market.failed', { reason: outcome.message }),
        ...(outcome.failure === undefined ? {} : { failure: outcome.failure }),
        ...(outcome.pendingBuilds === undefined
          ? {}
          : { pendingBuilds: outcome.pendingBuilds, action }),
      });
      return;
    }
    const value = outcome.value;
    if (action === 'dismiss-followup') {
      changed({ force: true });
      seats.setPending(null);
      seats.setHeld(undefined);
      seats.setNotice(t('panels.market.dismissed'));
      return;
    }
    if (action === 'migrate-workbench') {
      const added = recordOf(value)?.['added'];
      changed({ force: true });
      seats.setPending(null);
      seats.setHeld(undefined);
      seats.setNotice(
        typeof added === 'number'
          ? t('panels.market.migrateDone', { added: String(added) })
          : t('panels.market.migrateDoneNoCount'),
      );
      return;
    }
    const change: BundleChange | undefined = changeOf(value);
    const remedy = remedyOf(value);
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
    const cardOf = (fact?: string) =>
      remedy === undefined || (verdict.kind !== 'no-change' && verdict.kind !== 'failed')
        ? {}
        : {
            card: updateStuckCardOf(t, {
              command: remedy.command,
              ...(fact === undefined ? {} : { fact }),
              ...(next.version === undefined ? {} : { from: next.version }),
              ...(next.latest === undefined ? {} : { latest: next.latest }),
            }),
          };
    changed({ force: true });
    if (failure !== undefined) {
      seats.setPending(null);
      seats.setHeld(undefined);
      seats.setFailed({
        id,
        message: failure,
        ...cardOf(),
        ...(change?.pendingBuilds === undefined ? {} : { pendingBuilds: change.pendingBuilds, action }),
      });
      return;
    }
    const until = swapUntil(action, change?.application, next.latest);
    const application = change?.application ?? (assumedApplied(action) ? 'applied' : undefined);
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
    const reason = changeFailure(change, t);
    if (reason !== undefined) {
      const stuck = cardOf(reason);
      const install = stuck.card === undefined ? installCardOf(change, t, reason) : undefined;
      seats.setFailed({
        id,
        message: t('panels.market.failed', { reason }),
        ...stuck,
        ...(install === undefined ? {} : { card: install }),
        ...(change?.pendingBuilds === undefined ? {} : { pendingBuilds: change.pendingBuilds, action }),
      });
    }
  };

  const many = async (ids: readonly string[], action: MarketRowAction): Promise<void> => {
    quiet = true;
    try {
      for (const id of ids) await act(id, action);
    } finally {
      quiet = false;
    }
    onChanged({ force: true });
  };

  return Object.assign(act, { many });
}
