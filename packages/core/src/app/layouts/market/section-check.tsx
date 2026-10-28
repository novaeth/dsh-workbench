import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { MIN_BUSY_MS } from '@dsh-workbench/shared';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';
import type { LatestCheckSummary } from '../rightbar/market-rows';
import { MarketCheck } from './market-check';
import type { VersionsCheck, VersionsPart } from './use-module-versions';

export interface SectionCheckProps {
  readonly t: Translate;
  readonly part: VersionsPart;
  readonly seat: VersionsCheck;
  readonly latest: LatestCheckSummary;
  readonly disabled: boolean;
  readonly onCheck?: ((part: VersionsPart) => void) | undefined;
}

export function SectionCheck({
  t,
  part,
  seat,
  latest,
  disabled,
  onCheck,
}: SectionCheckProps) {
  const { busy } = useVisibleBusy(seat.checking, MIN_BUSY_MS);
  return (
    <MarketCheck
      t={t}
      checkedAt={seat.checkedAt}
      latestCheck={latest}
      checking={busy}
      failed={seat.failed}
      disabled={disabled}
      onCheck={() => onCheck?.(part)}
    />
  );
}
