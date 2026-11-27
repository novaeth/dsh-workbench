import type { WorkbenchSelfUpdate, WorkbenchVersion } from '@/kernel/contract/bundle-install';
import {
  selfUpdateMark,
  selfUpdateNote,
  selfUpdateSwapping,
  type SelfUpdateMark,
} from './market-settle';
import type { MarketHint, MarketNote, MarketRow, MarketRowAction } from './market-row-types';
import { updateBlockHintOf } from './market-update-block';

export const WORKBENCH_ROW_ID = 'workbench:self';

export const WORKBENCH_TITLE_KEY = 'panels.market.workbenchName';

const RESULT_KINDS: ReadonlySet<SelfUpdateMark['kind']> = new Set(['restored', 'failed']);

function brokenRow(version: WorkbenchVersion): MarketRow {
  const command = version.rescue ?? '';
  return {
    id: WORKBENCH_ROW_ID,
    titleKey: WORKBENCH_TITLE_KEY,
    workbench: true,
    broken: true,
    state: 'broken',
    canInstall: false,
    canUpdate: false,
    canUninstall: false,
    ...(version.spec === undefined ? {} : { spec: version.spec }),
    note:
      command === ''
        ? { key: 'panels.market.workbenchBrokenNoFix', params: {}, tone: 'alert' }
        : { key: 'panels.market.workbenchBroken', params: { command }, tone: 'alert' },
    problem:
      command === ''
        ? { kind: 'workbench-broken' as const }
        : { kind: 'workbench-broken' as const, command },
    pkg: version.pkg,
  };
}

export function workbenchRow(
  version: WorkbenchVersion | null | undefined,
  selfUpdate?: WorkbenchSelfUpdate | null,
  toldAt?: string | null,
): MarketRow | undefined {
  if (version === null || version === undefined) return undefined;
  if (version.broken === true) return brokenRow(version);
  if (version.installed === '') return undefined;
  const mark = selfUpdateMark({ update: selfUpdate, toldAt });
  const local = version.local === true;
  const retry = !local && mark !== undefined && RESULT_KINDS.has(mark.kind);
  const swapping = selfUpdateSwapping(selfUpdate);
  const busy = selfUpdate?.busy === true;
  const running = version.running;
  const older = !local && version.diskOlder === true && running !== undefined;
  const latest = local ? undefined : version.latest;
  const learned =
    latest !== undefined &&
    selfUpdate?.state === 'failed' &&
    selfUpdate.failure === 'incompatible' &&
    selfUpdate.to === latest &&
    selfUpdate.requirements !== undefined &&
    selfUpdate.runtimeVersion !== undefined &&
    selfUpdate.runtimeVersion === version.dshVersion
      ? {
          kind: 'incompatible' as const,
          requirements: selfUpdate.requirements,
          ...(selfUpdate.runtimeVersion === undefined ? {} : { runtimeVersion: selfUpdate.runtimeVersion }),
        }
      : undefined;
  const latestBlocked = learned ?? version.latestBlocked;
  const latestBlocking =
    latestBlocked === undefined || latestBlocked.kind === 'unverified' ? undefined : latestBlocked;
  const target = older ? (latest !== undefined && latestBlocking === undefined ? latest : running) : latest;
  const update =
    target !== undefined && target !== version.installed
      ? { installed: version.installed, latest: target }
      : undefined;
  const staleNote = mark !== undefined && mark.kind === 'pending-restart' && update !== undefined;
  const reinstallNote = reinstallNoteOf(selfUpdate);
  const updateNote = mark === undefined || staleNote ? undefined : selfUpdateNote(mark, selfUpdate);
  const busyNote: MarketNote | undefined =
    busy && !swapping ? { key: 'panels.market.selfUpdateBusy', params: {}, tone: 'plain' } : undefined;
  const olderNote: MarketNote | undefined = older
    ? {
        key: 'panels.market.olderOnDiskNote',
        params: { installed: version.installed, running: running ?? '' },
        tone: 'alert',
      }
    : undefined;
  const note =
    olderNote ??
    (reinstallNote !== undefined && (updateNote === undefined || updateNote.tone !== 'alert')
      ? reinstallNote
      : (updateNote ?? busyNote));
  const blocked = older || update === undefined ? undefined : latestBlocked;
  const blocking = older || update === undefined ? undefined : latestBlocking;
  const blockedHint: MarketHint | undefined =
    blocked === undefined ? undefined : updateBlockHintOf(blocked);
  const stale =
    !older &&
    !local &&
    update === undefined &&
    running !== undefined &&
    running !== version.installed;
  const followUp = version.followUp;
  const followUpState = !older && !stale && followUp !== undefined;
  return {
    id: WORKBENCH_ROW_ID,
    titleKey: WORKBENCH_TITLE_KEY,
    workbench: true,
    state: older
      ? 'older-on-disk'
      : stale
        ? 'pending-restart'
        : followUpState
          ? 'pending-followup'
          : update === undefined
            ? 'installed'
            : 'outdated',
    canInstall: false,
    canUpdate: !swapping && !busy && blocking === undefined && (update !== undefined || retry),
    canUninstall: false,
    ...(local ? { local: true } : {}),
    ...(stale || followUpState || blockedHint === undefined ? {} : { hint: blockedHint }),
    ...(selfUpdate?.migration === true && selfUpdate.state === 'running'
      ? { hint: { key: 'panels.market.selfUpdateMigration' } }
      : {}),
    ...(note === undefined ? {} : { note }),
    version: {
      installed: version.installed,
      ...(target === undefined ? {} : { latest: target }),
    },
    ...(update === undefined
      ? {}
      : { moduleUpdate: { ...update, ...(blocked === undefined ? {} : { blocked }) } }),
    ...(followUp === undefined ? {} : { followUp }),
    ...(followUpState ? { hint: { key: 'panels.market.migrationHint' } } : {}),
    ...(selfUpdate?.reinstall?.state === 'failed'
      ? {
          problem: {
            kind: 'reinstall' as const,
            ...(selfUpdate.reinstall.reason === undefined ? {} : { detail: selfUpdate.reinstall.reason }),
          },
        }
      : {}),
    pkg: version.pkg,
    ...(version.spec === undefined ? {} : { spec: version.spec }),
    ...(version.registry === undefined ? {} : { registry: version.registry }),
  };
}

export function workbenchActionsOf(row: MarketRow): MarketRowAction[] {
  if (row.followUp !== undefined && row.state === 'pending-followup') {
    return row.followUp.hard ? ['migrate-workbench'] : ['migrate-workbench', 'dismiss-followup'];
  }
  return row.canUpdate ? ['update-workbench'] : [];
}

function reinstallNoteOf(update: WorkbenchSelfUpdate | null | undefined): MarketNote | undefined {
  const reinstall = update?.reinstall;
  if (reinstall?.state !== 'failed') return undefined;
  if (reinstall.attempts !== undefined && reinstall.attempts >= 3) {
    return { key: 'panels.market.selfUpdateReinstallStopped', params: {}, tone: 'alert' };
  }
  return { key: 'panels.market.selfUpdateReinstallFailed', params: {}, tone: 'alert' };
}
