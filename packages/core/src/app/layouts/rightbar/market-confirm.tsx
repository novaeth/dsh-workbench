import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketRow, MarketRowAction } from './market-rows';
import { marketRowTitle } from './market-rows';

function RiskConfirm({
  t,
  row,
  onConfirm,
  onCancel,
}: {
  readonly t: Translate;
  readonly row: MarketRow | undefined;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const rollback = row?.canRollback === true;
  return (
    <RiskConfirmation
      open={row !== undefined}
      title={
        rollback
          ? t('panels.market.confirmRollbackTitle', { version: row?.rollbackVersion ?? '' })
          : t('panels.market.confirmUninstallTitle', { name: row === undefined ? '' : marketRowTitle(row, t) })
      }
      description={
        rollback ? t('panels.market.confirmRollbackDetail') : t('panels.market.confirmUninstallDetail')
      }
      acknowledgeLabel={rollback ? t('panels.market.confirmRollbackAck') : t('panels.market.confirmUninstallAck')}
      cancelLabel={t('panels.market.confirmNo')}
      closeLabel={t('panels.market.confirmNo')}
      confirmLabel={rollback ? t('panels.market.confirmBack') : t('panels.market.confirmYes')}
      acknowledged={acknowledged}
      onAcknowledgedChange={setAcknowledged}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function MarketConfirm({
  t,
  confirming,
  row,
  onClose,
  act,
  rowById,
}: {
  readonly t: Translate;
  readonly confirming: string | null;
  readonly row: MarketRow | undefined;
  readonly onClose: () => void;
  readonly act: (id: string, action: MarketRowAction) => Promise<void>;
  readonly rowById: ReadonlyMap<string, MarketRow>;
}) {
  return (
    <RiskConfirm
      key={confirming ?? ''}
      t={t}
      row={row}
      onCancel={onClose}
      onConfirm={() => {
        const id = confirming;
        onClose();
        if (id === null) return;
        const target = rowById.get(id);
        void act(id, confirmActionOf(target));
      }}
    />
  );
}

export function confirmActionOf(row: MarketRow | undefined): MarketRowAction {
  if (row?.canRollback === true) return 'rollback-workbench';
  if (row?.plugin === true) return 'uninstall-plugin';
  if (row?.removeViaBundle === true) return 'remove-bundle';
  return 'uninstall';
}
