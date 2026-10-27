import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { DiscoverController } from './use-discover';
import { DiscoverConfirm } from './discover-confirm';
import { DiscoverInitDialog } from './discover-init-dialog';
import { DiscoverSourcesDialog } from './discover-sources-dialog';

export interface DiscoverDialogsProps {
  readonly t: Translate;
  readonly d: DiscoverController;
}

export function DiscoverDialogs({ t, d }: DiscoverDialogsProps) {
  return (
    <Fragment>
      <DiscoverSourcesDialog
        t={t}
        open={d.manageOpen}
        sources={d.sources}
        selected={d.selected}
        loading={d.loading}
        slow={d.slow}
        problem={d.problem}
        failure={d.writeFailed}
        busy={d.busy}
        adding={d.addingSource}
        pendingSourceId={d.pendingSourceId}
        onClose={() => d.setManageOpen(false)}
        onAdd={d.addSource}
        onRemove={d.removeSourceById}
        onSelect={d.selectSource}
        onEnable={d.enableSource}
        onReadOnly={d.readOnlySource}
      />
      <DiscoverConfirm
        t={t}
        locale={d.locale}
        choice={d.choice}
        onCancel={() => d.setChoice(null)}
        onConfirm={d.install}
      />
      <DiscoverInitDialog
        key={d.initOpen ? 'open' : 'closed'}
        t={t}
        open={d.initOpen}
        defaultBranch={d.defaultBranch}
        busy={d.busy}
        onClose={() => d.setInitOpen(false)}
        onConfirm={d.initialize}
      />
    </Fragment>
  );
}
