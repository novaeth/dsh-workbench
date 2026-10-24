import { createElement as h, useState } from 'react';
import type {
  BoardModule,
  BoardModuleProps,
  ModuleSummary,
  PanelStep,
  SuiteWorld,
  Translate,
} from '@dsh-workbench/shared';
import { CardAnchor, CardBoundary } from '@dsh-workbench/shared';

import { boardColumnCount, type BoardSlot } from './board-columns';
import { useBoardSplit } from './use-board-split';
import type { BoardPlan } from './board-plan';
import styles from './Rightbar.module.css';

export function workspacePathOf(world: SuiteWorld): string {
  return world.current.workspace?.path ?? '';
}

export function ModuleHost({
  module,
  step,
  panelToken,
  onPanelRefresh,
  onSummary,
  ...rest
}: {
  module: BoardModule;
  step?: string;
  panelToken: number;
  onPanelRefresh: () => void;
} & Omit<BoardModuleProps, 'refreshToken' | 'onRefresh' | 'onSummary'> & {
    onSummary: (id: string, summary: ModuleSummary) => void;
  }) {
  const [ownToken, setOwnToken] = useState(0);
  void onPanelRefresh;

  const View = step === undefined ? module.View : (module.steps?.[step]?.View ?? module.View);

  return (
    <View
      {...rest}
      refreshToken={panelToken + ownToken}
      onRefresh={() => setOwnToken((value) => value + 1)}
      onSummary={(next) => onSummary(module.id, next)}
    />
  );
}

export function BoardGrid({
  entries,
  panelWidth,
  world,
  panelToken,
  onPanelRefresh,
  onNavigate,
  onOpenMarket,
  onSummary,
  onCardFailure,
  t,
}: {
  entries: BoardPlan['modules'];
  panelWidth: number;
  world: SuiteWorld;
  panelToken: number;
  onPanelRefresh: () => void;
  onNavigate: (step: PanelStep) => void;
  onOpenMarket: () => void;
  onSummary: (id: string, summary: ModuleSummary) => void;
  onCardFailure: (unit: string, reason: string) => void;
  t: Translate;
}) {
  const columnCount = boardColumnCount(panelWidth, entries.length);
  const { root, slots } = useBoardSplit(
    entries.map((entry) => entry.key),
    columnCount,
  );
  if (entries.length === 0) return null;
  const plain: readonly BoardSlot[] = entries.map((_entry, index) => ({
    index,
    breakBefore: false,
    trailing: false,
  }));
  const order = slots !== null && slots.length === entries.length ? slots : plain;

  return (
    <div className={styles.columns} ref={root} style={{ columnCount }}>
      {order.map((slot) => {
        const entry = entries[slot.index];
        return (
          <div
            className={styles.cell}
            key={entry.key}
            data-wb-cell={entry.key}
            style={{
              breakBefore: slot.breakBefore ? 'column' : undefined,
              marginBottom: slot.trailing ? 0 : undefined,
            }}
          >
            <CardAnchor unit={entry.module.id}>
              <CardBoundary
                unit={entry.module.id}
                resetKey={`${entry.key}:${panelToken}:${workspacePathOf(world)}`}
                t={t}
                onFailure={(reason) => onCardFailure(entry.module.id, reason)}
              >
                <ModuleHost
                  module={entry.module}
                  world={world}
                  panelToken={panelToken}
                  onPanelRefresh={onPanelRefresh}
                  onNavigate={onNavigate}
                  onOpenMarket={onOpenMarket}
                  onSummary={onSummary}
                  t={t}
                />
              </CardBoundary>
            </CardAnchor>
          </div>
        );
      })}
    </div>
  );
}
