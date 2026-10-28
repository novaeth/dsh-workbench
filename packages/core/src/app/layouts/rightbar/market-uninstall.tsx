import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketRow, MarketRowAction } from './market-rows';
import { marketRowTitle } from './market-rows';

function ConfirmUninstall({
  t,
  name,
  onConfirm,
  onCancel,
}: {
  readonly t: Translate;
  readonly name: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <RiskConfirmation
      open={name !== null}
      title={t('panels.market.confirmUninstallTitle', { name: name ?? '' })}
      description={t('panels.market.confirmUninstallDetail')}
      acknowledgeLabel={t('panels.market.confirmUninstallAck')}
      cancelLabel={t('panels.market.confirmNo')}
      closeLabel={t('panels.market.confirmNo')}
      confirmLabel={t('panels.market.confirmYes')}
      acknowledged={acknowledged}
      onAcknowledgedChange={setAcknowledged}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function UninstallConfirm({
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
    <ConfirmUninstall
      key={confirming ?? ''}
      t={t}
      name={row === undefined ? null : marketRowTitle(row, t)}
      onCancel={onClose}
      onConfirm={() => {
        const id = confirming;
        onClose();
        if (id === null) return;
        const target = rowById.get(id);
        void act(
          id,
          target?.plugin === true
            ? 'uninstall-plugin'
            : target?.pkg === undefined
              ? 'uninstall'
              : 'remove-bundle',
        );
      }}
    />
  );
}
