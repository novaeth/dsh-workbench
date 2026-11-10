import dayjs from 'dayjs';
import {
  SELF_UPDATE_QUEUED_TTL_MS,
  SELF_UPDATE_RUNNING_TTL_MS,
} from '@dsh-workbench/shared/contract/protocol/bundle-install';
import type { WorkbenchSelfUpdate } from '@/kernel/contract/bundle-install';
import type { MarketHintKey, MarketNote, MarketRowAction, ModuleUpdate } from './market-row-types';
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
  'install-version',
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
  return action === 'update-bundle' || action === 'install-version' ? version !== undefined : true;
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

export type SelfUpdateCause = NonNullable<WorkbenchSelfUpdate['reason']>;

export interface SelfUpdateStop {
  readonly kind: 'failed' | 'restored' | 'rolled-back';
  readonly at?: string;
  readonly cause?: SelfUpdateCause;
  readonly fix?: string;
  readonly version?: string;
}

export interface SelfUpdateQueued {
  readonly kind: 'queued';
  readonly at?: string;
}

export interface SelfUpdateOk {
  readonly kind: 'ok';
  readonly at?: string;
}

export interface SelfUpdatePendingRestart {
  readonly kind: 'pending-restart';
  readonly at?: string;
  readonly version?: string;
}

export type SelfUpdateMark = SelfUpdateStop | SelfUpdateQueued | SelfUpdateOk | SelfUpdatePendingRestart;

function stopKindOf(state: WorkbenchSelfUpdate['state']): SelfUpdateStop['kind'] | undefined {
  return state === 'failed' || state === 'restored' || state === 'rolled-back' ? state : undefined;
}

function tailLine(tail: string | undefined): string | undefined {
  if (tail === undefined) return undefined;
  const parts = tail
    .split(' / ')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  const last = parts.at(-1);
  if (last === undefined) return undefined;
  return last.length <= 240 ? last : `${last.slice(0, 240)}…`;
}

function markOf(kind: SelfUpdateStop['kind'], update: WorkbenchSelfUpdate): SelfUpdateStop {
  const fix = update.state === 'failed' ? tailLine(update.tail) : undefined;
  return {
    kind,
    ...(update.at === undefined ? {} : { at: update.at }),
    ...(update.reason === undefined ? {} : { cause: update.reason }),
    ...(fix === undefined ? {} : { fix }),
    ...(update.version === undefined ? {} : { version: update.version }),
  };
}

export function selfUpdateStop(input: {
  readonly until: string | undefined;
  readonly since: number | undefined;
  readonly update: WorkbenchSelfUpdate | null | undefined;
}): SelfUpdateStop | undefined {
  const { until, since, update } = input;
  if (until === undefined || update === undefined || update === null) return undefined;
  const kind = stopKindOf(update.state);
  if (kind === undefined) return undefined;
  if (update.to !== until && update.version !== until) return undefined;
  if (since !== undefined && update.at !== undefined) {
    const at = dayjs(update.at).valueOf();
    if (Number.isFinite(at) && at < since - 5000) return undefined;
  }
  return markOf(kind, update);
}

export function selfUpdateMark(input: {
  readonly update: WorkbenchSelfUpdate | null | undefined;
  readonly toldAt: string | null | undefined;
}): SelfUpdateMark | undefined {
  const { update, toldAt } = input;
  if (update === undefined || update === null) return undefined;
  const at = update.at;
  if (update.state === 'queued') return { kind: 'queued', ...(at === undefined ? {} : { at }) };
  if (update.state === 'ok') return { kind: 'ok', ...(at === undefined ? {} : { at }) };
  if (update.state === 'pending-restart') {
    return {
      kind: 'pending-restart',
      ...(at === undefined ? {} : { at }),
      ...(update.version === undefined ? {} : { version: update.version }),
    };
  }
  const kind = stopKindOf(update.state);
  if (kind === undefined) return undefined;
  if (at !== undefined && toldAt !== undefined && toldAt !== null && at <= toldAt) return undefined;
  return markOf(kind, update);
}

export function selfUpdateNote(mark: SelfUpdateMark): MarketNote | undefined {
  if (mark.kind === 'ok') return undefined;
  if (mark.kind === 'pending-restart') {
    return { key: 'panels.market.selfUpdatePendingRestart', params: {}, tone: 'plain' };
  }
  if (mark.kind === 'queued') {
    return { key: 'panels.market.selfUpdateQueued', params: {}, tone: 'plain' };
  }
  const version = mark.version ?? '?';
  if (mark.kind === 'restored') {
    return { key: 'panels.market.selfUpdateRestored', params: { version }, tone: 'alert' };
  }
  if (mark.kind === 'rolled-back') {
    return { key: 'panels.market.selfUpdateRolledBack', params: { version }, tone: 'alert' };
  }
  return mark.fix === undefined
    ? { key: 'panels.market.selfUpdateFailedNoFix', params: {}, tone: 'alert' }
    : { key: 'panels.market.selfUpdateFailed', params: { fix: mark.fix }, tone: 'alert' };
}

const CAUSE_HINT: Readonly<Record<SelfUpdateCause, MarketHintKey>> = {
  occupied: 'panels.market.selfUpdateReasonOccupied',
  incomplete: 'panels.market.selfUpdateReasonIncomplete',
  'rollback-failed': 'panels.market.selfUpdateReasonRollbackFailed',
  'boot-failed': 'panels.market.selfUpdateReasonBootFailed',
};

export function selfUpdateReasonHint(mark: SelfUpdateMark): MarketHintKey | undefined {
  if (mark.kind !== 'failed' && mark.kind !== 'restored' && mark.kind !== 'rolled-back') return undefined;
  return mark.cause === undefined ? 'panels.market.selfUpdateReasonUnknown' : CAUSE_HINT[mark.cause];
}

export const WORKBENCH_SWAP_RUNNING_MS = SELF_UPDATE_RUNNING_TTL_MS;

export const WORKBENCH_QUEUE_WAIT_MS = SELF_UPDATE_QUEUED_TTL_MS;

export function selfUpdateSwapping(update: WorkbenchSelfUpdate | null | undefined): boolean {
  if (update === undefined || update === null) return false;
  if (update.state !== 'queued' && update.state !== 'running') return false;
  if (update.state === 'queued' && update.at === undefined) return true;
  if (update.at === undefined) return true;
  const at = dayjs(update.at).valueOf();
  const window = update.state === 'queued' ? WORKBENCH_QUEUE_WAIT_MS : WORKBENCH_SWAP_RUNNING_MS;
  return !Number.isFinite(at) || Date.now() - at < window;
}

export function holdWindowMs(until: string | undefined): number {
  return until === undefined ? MODULE_SETTLE_MS : WORKBENCH_SWAP_MS;
}
