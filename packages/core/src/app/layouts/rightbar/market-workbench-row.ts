import type { WorkbenchSelfUpdate, WorkbenchVersion } from '@/kernel/contract/bundle-install';
import {
  selfUpdateMark,
  selfUpdateNote,
  selfUpdateSwapping,
  type SelfUpdateMark,
} from './market-settle';
import type { MarketHintKey, MarketRow, MarketRowAction } from './market-row-types';

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
  const latest = local ? undefined : version.latest;
  const update =
    latest !== undefined && latest !== version.installed
      ? { installed: version.installed, latest }
      : undefined;
  const staleNote = mark !== undefined && mark.kind === 'pending-restart' && update !== undefined;
  const note = mark === undefined || staleNote ? undefined : selfUpdateNote(mark);
  const blocked = update === undefined ? undefined : version.latestBlocked;
  const blockedHint: MarketHintKey | undefined =
    blocked === undefined ? undefined : 'panels.market.workbenchUpdateNeedsDsh';
  const stale =
    !local && update === undefined && version.running !== undefined && version.running !== version.installed;
  const followUp = version.followUp;
  const followUpState = !stale && followUp !== undefined;
  return {
    id: WORKBENCH_ROW_ID,
    titleKey: WORKBENCH_TITLE_KEY,
    workbench: true,
    state: stale
      ? 'pending-restart'
      : followUpState
        ? 'pending-followup'
        : update === undefined
          ? 'installed'
          : 'outdated',
    canInstall: false,
    canUpdate: !swapping && blocked === undefined && (update !== undefined || retry),
    canUninstall: false,
    ...(local ? { local: true } : {}),
    ...(stale || followUpState || blockedHint === undefined ? {} : { hint: blockedHint }),
    ...(selfUpdate?.migration === true && selfUpdate.state === 'running'
      ? { hint: 'panels.market.selfUpdateMigration' as const }
      : {}),
    ...(note === undefined ? {} : { note }),
    version: {
      installed: version.installed,
      ...(latest === undefined ? {} : { latest }),
    },
    ...(update === undefined
      ? {}
      : { moduleUpdate: { ...update, ...(blocked === undefined ? {} : { blocked }) } }),
    ...(followUp === undefined ? {} : { followUp }),
    ...(followUpState ? { hint: 'panels.market.migrationHint' as const } : {}),
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
