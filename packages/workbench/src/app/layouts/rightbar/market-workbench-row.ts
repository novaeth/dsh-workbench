import type { WorkbenchVersion } from '@/shared/api/bundle-install';
import type { MarketNote, MarketRow } from './market-row-types';

export const WORKBENCH_ROW_ID = 'workbench:self';

export const WORKBENCH_TITLE_KEY = 'panels.market.workbenchName';

export function workbenchRow(version: WorkbenchVersion | null | undefined): MarketRow | undefined {
  if (version === null || version === undefined || version.installed === '') return undefined;
  const local = version.local === true;
  const latest = local ? undefined : version.latest;
  const update =
    latest !== undefined && latest !== version.installed
      ? { installed: version.installed, latest }
      : undefined;
  const note: MarketNote | undefined = local
    ? { key: 'panels.market.workbenchLocal', params: {} }
    : undefined;
  const stale = !local && version.running !== undefined && version.running !== version.installed;
  return {
    id: WORKBENCH_ROW_ID,
    titleKey: WORKBENCH_TITLE_KEY,
    workbench: true,
    state: stale ? 'pending-restart' : update === undefined ? 'installed' : 'outdated',
    canInstall: false,
    canUpdate: update !== undefined,
    canUninstall: false,
    ...(note === undefined ? {} : { note }),
    version: {
      installed: version.installed,
      ...(latest === undefined ? {} : { latest }),
    },
    ...(update === undefined ? {} : { moduleUpdate: update }),
    pkg: version.pkg,
  };
}
