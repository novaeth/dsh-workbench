import { Fragment, createElement as h } from 'react';
import type { MarketBodyProps, MarketSceneExtras } from './market-body-props';
import { MarketBody } from './market-body';
import { MarketChecking, MarketEmpty } from './MarketStates';
import { MarketUnreadableBadge } from './market-unreadable-badge';
import { MarketDetailPage } from './market-detail-page';
import { SharedDetailPage } from './market-shared-detail';
import { UninstallConfirm } from './market-uninstall';

export function MarketSceneView({
  t,
  runtimePluginMarket,
  self,
  shown,
  pluginList,
  installedList,
  unreadable = [],
  readStale = false,
  pending,
  failed,
  notice,
  readFailure = null,
  act,
  onConfirming,
  setDefault,
  boardBusy,
  checks,
  onRecheck,
  rechecking,
  onOpenDetail,
  detailRow,
  detailShared,
  detailDependencies,
  confirming,
  confirmingRow,
  rowById,
  settled,
  nothing,
  settlingSize,
  onBack,
}: MarketBodyProps & MarketSceneExtras) {
  if (detailShared !== undefined) {
    const sharedFailure = failed?.id === detailShared.id ? failed : null;
    return (
      <SharedDetailPage
        key={detailShared.id}
        t={t}
        row={detailShared}
        pending={pending}
        failure={sharedFailure}
        onBack={onBack}
        onAct={(action) => void act(detailShared.id, action)}
        onApproveBuilds={() => {
          if (sharedFailure?.pendingBuilds !== undefined && sharedFailure.action !== undefined) {
            void act(detailShared.id, sharedFailure.action, { approvedBuilds: sharedFailure.pendingBuilds });
          }
        }}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />
    );
  }
  if (detailRow !== undefined) {
    const moduleFailure = failed?.id === detailRow.id ? failed : null;
    return (
      <MarketDetailPage
        key={detailRow.id}
        t={t}
        row={detailRow}
        dependencies={detailDependencies}
        pending={pending}
        failure={moduleFailure}
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
  if (nothing) {
    return (
      <>
        {h(MarketUnreadableBadge, { t, rows: unreadable })}
        <MarketEmpty t={t} />
      </>
    );
  }
  return (
    <>
      <MarketBody
        readFailure={readFailure ?? null}
        t={t}
        runtimePluginMarket={runtimePluginMarket}
        self={self}
        shown={shown}
        pluginList={pluginList}
        installedList={installedList}
        unreadable={unreadable}
        readStale={readStale}
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
