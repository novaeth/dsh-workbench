import type { ReactNode } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { MIN_BUSY_MS } from '@dsh-workbench/shared';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';

import type { VersionsCheck } from '../market/use-module-versions';
import type { VersionsPart } from '../market/use-module-versions';
import { sectionChecksOf } from './market-section-checks';
import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import type { ModuleVersion } from '@/kernel/contract/bundle-install';
import { latestCheckSummary } from './market-rows';

export interface MarketChecksInput {
  readonly t: Translate;
  readonly installed: readonly ModuleVersion[] | null | undefined;
  readonly plugins: readonly InstalledPlugin[] | null | undefined;
  readonly modulesCheck: VersionsCheck | undefined;
  readonly pluginsCheck: VersionsCheck | undefined;
  readonly pending: unknown;
  readonly onCheck: ((part: VersionsPart) => void) | undefined;
  readonly onChanged: (options: { readonly force?: boolean }) => void;
  readonly setFailed: (next: null) => void;
  readonly checking: boolean;
  readonly marketProblem: boolean;
}

export interface MarketChecks {
  readonly checks: Readonly<Record<VersionsPart, ReactNode>>;
  readonly recheck: () => void;
  readonly rechecking: boolean;
}

const IDLE_CHECK: VersionsCheck = { checking: false, failed: false, checkedAt: null };

export function useMarketChecks(input: MarketChecksInput): MarketChecks {
  const { t } = input;
  const { busy: rechecking } = useVisibleBusy(input.checking, MIN_BUSY_MS);
  const recheck = (): void => {
    input.setFailed(null);
    input.onChanged({ force: true });
  };
  const checks = sectionChecksOf(
    t,
    { modules: input.modulesCheck ?? IDLE_CHECK, plugins: input.pluginsCheck ?? IDLE_CHECK },
    {
      latestModules: latestCheckSummary(input.installed ?? undefined),
      latestPlugins: { unknown: 0 },
      disabled: input.pending !== null,
      moduleSourceFailed: input.marketProblem,
      onCheck: input.onCheck,
    },
  );
  return { checks, recheck, rechecking };
}
