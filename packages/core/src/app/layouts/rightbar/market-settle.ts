import dayjs from 'dayjs';
import type { WorkbenchSelfUpdate } from '@/kernel/contract/bundle-install';
import type { MarketRowAction, ModuleUpdate } from './market-row-types';
import type { SharedState } from './market-shared-rows';

export const MODULE_SETTLE_MS = 15000;

export function holdBack(
  installed: readonly string[],
  roster: ReadonlySet<string>,
  active: ReadonlySet<string>,
  previous: ReadonlySet<string> | null,
): readonly string[] {
  const pending = installed.filter((unit) => !roster.has(unit));
  const fresh = previous === null ? [] : pending.filter((unit) => !previous.has(unit));
  return pending.filter((unit) => active.has(unit) || fresh.includes(unit));
}

export const WORKBENCH_SWAP_MS = 180000;
export const WORKBENCH_SWAP_POLL_MS = 800;

export function swapLanded(until: string | undefined, installed: string | undefined): boolean {
  return until !== undefined && installed === until;
}

export function swapUntil(
  action: string,
  application: string | undefined,
  latest: string | undefined,
): string | undefined {
  if (action !== 'update-workbench' || application !== 'restart-required') return undefined;
  return latest;
}

const READ_BACK_ACTIONS: ReadonlySet<MarketRowAction> = new Set<MarketRowAction>([
  'update',
  'update-bundle',
  'update-dependency',
  'update-plugin',
]);

export const REMOVAL_ACTIONS: ReadonlySet<MarketRowAction> = new Set<MarketRowAction>([
  'remove-bundle',
  'uninstall',
  'uninstall-plugin',
]);

export function awaitsReadBack(
  action: MarketRowAction,
  application: string | undefined,
  version: string | undefined,
): boolean {
  if (application !== 'applied') return false;
  if (REMOVAL_ACTIONS.has(action)) return true;
  if (!READ_BACK_ACTIONS.has(action)) return false;
  return action === 'update-bundle' ? version !== undefined : true;
}

export function readBackDone(input: {
  readonly action: MarketRowAction;
  readonly entry: ModuleUpdate | undefined;
  readonly clicked: string | undefined;
  readonly outdated: boolean;
}): boolean {
  if (input.action === 'update') return !input.outdated;
  if (input.entry === undefined || input.entry.local === true || input.entry.latest === undefined) {
    return true;
  }
  if (input.entry.latest === input.entry.installed) return true;
  if (input.clicked === undefined) return true;
  return input.entry.installed !== input.clicked;
}

export function settleLanded(input: {
  readonly action: MarketRowAction;
  readonly until: string | undefined;
  readonly readBack: boolean | undefined;
  readonly installed: string | undefined;
  readonly entry: ModuleUpdate | undefined;
  readonly clicked: string | undefined;
  readonly outdated: boolean;
  readonly sharedState?: SharedState | undefined;
  readonly pluginOutdated?: boolean | null | undefined;
  readonly unitGone?: boolean | null | undefined;
  readonly pluginGone?: boolean | null | undefined;
}): boolean {
  if (input.until !== undefined) return swapLanded(input.until, input.installed);
  if (input.readBack !== true) return true;
  if (input.action === 'remove-bundle' || input.action === 'uninstall') return input.unitGone === true;
  if (input.action === 'uninstall-plugin') return input.pluginGone === true;
  const settled = (state: SharedState | undefined): boolean =>
    state !== undefined &&
    state !== 'outdated' &&
    state !== 'unsatisfied' &&
    state !== 'checking' &&
    state !== 'unchecked';
  if (input.action === 'update-dependency') return settled(input.sharedState);
  if (input.action === 'update-plugin') return input.pluginOutdated === false;
  return readBackDone({
    action: input.action,
    entry: input.entry,
    clicked: input.clicked,
    outdated: input.outdated,
  });
}

export interface SelfUpdateStop {
  readonly kind: 'failed' | 'rolled-back';
  readonly reason?: string;
  readonly version?: string;
}

function tailReason(tail: string | undefined): string | undefined {
  if (tail === undefined) return undefined;
  const parts = tail
    .split(' / ')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const last = parts.at(-1);
  if (last === undefined) return undefined;
  return last.length <= 240 ? last : `${last.slice(0, 240)}…`;
}

export function selfUpdateStop(input: {
  readonly until: string | undefined;
  readonly since: number | undefined;
  readonly update: WorkbenchSelfUpdate | null | undefined;
}): SelfUpdateStop | undefined {
  const { until, since, update } = input;
  if (until === undefined || update === undefined || update === null) return undefined;
  if (update.state !== 'failed' && update.state !== 'rolled-back') return undefined;
  if (update.to !== until && update.version !== until) return undefined;
  if (since !== undefined && update.at !== undefined) {
    const at = dayjs(update.at).valueOf();
    if (Number.isFinite(at) && at < since - 5000) return undefined;
  }
  return {
    kind: update.state,
    ...(update.version === undefined ? {} : { version: update.version }),
    ...(update.state === 'failed' && tailReason(update.tail) !== undefined
      ? { reason: tailReason(update.tail) as string }
      : {}),
  };
}

export function holdWindowMs(until: string | undefined): number {
  return until === undefined ? MODULE_SETTLE_MS : WORKBENCH_SWAP_MS;
}
