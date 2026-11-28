import type { ReactNode, Translate } from '@dsh-workbench/shared';
import type { MarketAct } from './market-act';
import type { MarketFailure, MarketRow } from './market-row-types';
import type { Pending } from './market-view-text';
import type { DetailDependency } from './market-detail-deps';
import type { SharedRow } from './market-shared-rows';
import type { VersionsPart } from '../market/use-module-versions';

export interface MarketBodyProps {
  readonly t: Translate;
  readonly runtimePluginMarket?: boolean | undefined;
  readonly self: MarketRow | undefined;
  readonly shown: readonly MarketRow[];
  readonly pluginList: readonly MarketRow[];
  readonly installedList: readonly MarketRow[];
  readonly unreadable?: readonly { readonly pkg: string; readonly reason: string }[] | undefined;
  readonly readStale?: boolean | undefined;
  readonly pending: Pending | null;
  readonly failed: MarketFailure | null;
  readonly notice: string | null;
  readonly readFailure?: string | null | undefined;
  readonly act: MarketAct;
  readonly onConfirming: (id: string | null) => void;
  readonly setDefault: (id: string, next: boolean) => Promise<void>;
  readonly boardBusy: boolean;
  readonly checks: Readonly<Record<VersionsPart, ReactNode>>;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}

export interface MarketBodyExtras {
  readonly onOpenDetail?: ((id: string) => void) | undefined;
  readonly onBuildModule?: (() => void) | undefined;
}

export interface MarketSceneExtras {
  readonly onOpenDetail: (id: string) => void;
  readonly detailRow: MarketRow | undefined;
  readonly detailShared: SharedRow | undefined;
  readonly detailDependencies: readonly DetailDependency[];
  readonly confirming: string | null;
  readonly confirmingRow: MarketRow | undefined;
  readonly rowById: ReadonlyMap<string, MarketRow>;
  readonly settled: boolean;
  readonly nothing: boolean;
  readonly settlingSize: number;
  readonly onBack: () => void;
  readonly onBuildModule?: (() => void) | undefined;
}
