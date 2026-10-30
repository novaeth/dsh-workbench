import { Fragment, createElement as h } from 'react';
import type { ReactNode, Translate } from '@dsh-workbench/shared';
import type { MarketFailure, MarketRow, MarketRowAction } from './market-row-types';
import type { SharedRow } from './market-shared-rows';
import type { VersionsPart } from '../market/use-module-versions';
import type { Pending } from './market-view-text';
import { MarketBody } from './market-body';
import { MarketChecking, MarketEmpty } from './MarketStates';
import { MarketDetailPage } from './market-detail-page';
import { UninstallConfirm } from './market-uninstall';

export function MarketSceneView({
  t,
  runtimePluginMarket,
  self,
  shown,
  pluginList,
  installedList,
  shared,
  pending,
  failed,
  notice,
  act,
  onConfirming,
  setDefault,
  boardBusy,
  checks,
  onRecheck,
  rechecking,
  onOpenDetail,
  detailRow,
  confirming,
  confirmingRow,
  rowById,
  settled,
  nothing,
  settlingSize,
  onBack,
}: {
  readonly t: Translate;
  readonly runtimePluginMarket?: boolean | undefined;
  readonly self: MarketRow | undefined;
  readonly shown: readonly MarketRow[];
  readonly pluginList: readonly MarketRow[];
  readonly installedList: readonly MarketRow[];
  readonly shared: readonly SharedRow[];
  readonly pending: Pending | null;
  readonly failed: MarketFailure | null;
  readonly notice: string | null;
  readonly act: (id: string, action: MarketRowAction) => Promise<void>;
  readonly onConfirming: (id: string | null) => void;
  readonly setDefault: (id: string, next: boolean) => Promise<void>;
  readonly boardBusy: boolean;
  readonly checks: Readonly<Record<VersionsPart, ReactNode>>;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
  readonly onOpenDetail: (id: string) => void;
  readonly detailRow: MarketRow | undefined;
  readonly confirming: string | null;
  readonly confirmingRow: MarketRow | undefined;
  readonly rowById: ReadonlyMap<string, MarketRow>;
  readonly settled: boolean;
  readonly nothing: boolean;
  readonly settlingSize: number;
  readonly onBack: () => void;
}) {
  if (detailRow !== undefined) {
    return (
      <MarketDetailPage
        t={t}
        row={detailRow}
        pending={pending}
        failure={failed?.id === detailRow.id ? failed : null}
        notice={notice}
        boardBusy={boardBusy}
        confirming={confirming}
        confirmingRow={confirmingRow}
        rowById={rowById}
        onBack={onBack}
        onConfirming={onConfirming}
        onDefault={setDefault}
        onAct={act}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />
    );
  }
  if (!settled || (settlingSize > 0 && shown.length === 0 && installedList.length === 0))
    return <MarketChecking t={t} />;
  if (nothing) return <MarketEmpty t={t} />;
  return (
    <>
      <MarketBody
        t={t}
        runtimePluginMarket={runtimePluginMarket}
        self={self}
        shown={shown}
        pluginList={pluginList}
        installedList={installedList}
        shared={shared}
        pending={pending}
        failed={failed}
        notice={notice}
        act={act}
        onConfirming={onConfirming}
        setDefault={setDefault}
        boardBusy={boardBusy}
        checks={checks}
        onRecheck={onRecheck}
        rechecking={rechecking}
        onOpenDetail={onOpenDetail}
      />
      <UninstallConfirm
        t={t}
        confirming={confirming}
        row={confirmingRow}
        onClose={() => onConfirming(null)}
        act={act}
        rowById={rowById}
      />
    </>
  );
}
