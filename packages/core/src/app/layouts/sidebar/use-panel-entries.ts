import { useEffect, useState } from 'react';
import type { PanelEntry } from '@dsh-workbench/shared';

export function usePanelEntries(seat: {
  readonly listPanels: () => PanelEntry[];
  readonly hasPanelActions: () => boolean;
  readonly subscribePanels: (callback: () => void) => () => void;
}): readonly [PanelEntry[], boolean] {
  const [entries, setEntries] = useState<PanelEntry[]>(() => seat.listPanels());
  const [hasActions, setHasActions] = useState(() => seat.hasPanelActions());

  useEffect(
    () =>
      seat.subscribePanels(() => {
        setEntries(seat.listPanels());
        setHasActions(seat.hasPanelActions());
      }),
    [seat],
  );

  return [entries, hasActions];
}
