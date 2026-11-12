import type { InstalledPackageInfo } from '@/kernel/contract/market-index';
import type { DetailTab } from '../market/detail-tabs';

export interface InstalledDetailTabProps {
  readonly tab?: DetailTab | undefined;
  readonly onTab?: ((tab: DetailTab) => void) | undefined;
  readonly info?: InstalledPackageInfo | null | undefined;
}

export interface InstalledDetailRecheckProps {
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}
