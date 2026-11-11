import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { MarketFailure, MarketRow, MarketRowAction } from './market-row-types';
import type { Pending } from './market-view-text';
import { MarketDetail } from './market-detail';
import { UninstallConfirm } from './market-uninstall';

const CONFIRM_ACTIONS: readonly MarketRowAction[] = ['uninstall', 'remove-bundle', 'uninstall-plugin'];

export function MarketDetailPage({
  t,
  row,
  pending,
  failure,
  notice,
  boardBusy,
  confirming,
  confirmingRow,
  rowById,
  onBack,
  onConfirming,
  onDefault,
  onAct,
  onRecheck,
  rechecking,
}: {
  readonly t: Translate;
  readonly row: MarketRow;
  readonly pending: Pending | null;
  readonly failure: MarketFailure | null;
  readonly notice: string | null;
  readonly boardBusy?: boolean | undefined;
  readonly confirming: string | null;
  readonly confirmingRow: MarketRow | undefined;
  readonly rowById: ReadonlyMap<string, MarketRow>;
  readonly onBack: () => void;
  readonly onConfirming: (id: string | null) => void;
  readonly onDefault: (id: string, next: boolean) => Promise<void>;
  readonly onAct: (id: string, action: MarketRowAction) => Promise<void>;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}) {
  return (
    <>
      <MarketDetail
        t={t}
        row={row}
        pending={pending}
        failure={failure}
        notice={notice}
        boardBusy={boardBusy}
        onBack={onBack}
        onRequest={(action) =>
          CONFIRM_ACTIONS.includes(action) ? onConfirming(row.id) : void onAct(row.id, action)
        }
        onDefault={(next) => void onDefault(row.id, next)}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />
      <UninstallConfirm
        t={t}
        confirming={confirming}
        row={confirmingRow}
        onClose={() => onConfirming(null)}
        act={onAct}
        rowById={rowById}
      />
    </>
  );
}
