import { Fragment, createElement as h, useRef, useState } from 'react';
import { Tip } from '@/shared/components/Tip';
import type { Translate } from '@dsh-workbench/shared';
import { MIN_BUSY_MS } from '@dsh-workbench/shared';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { CenteredState } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';

import { PanelFoot } from '@/shared/components/PanelFoot';
import styles from './ModulesPage.module.css';
import { Button, RiskConfirmation } from '@deepseek-ai/dsh-client-ui-primitives';
import { panelDropTarget, rowAtPoint, selectPanelRows, type PanelRow } from './board-selection';
import { useVisibleBusy } from '@/shared/hooks/use-visible-busy';
import { PanelGroupRows } from './PanelGroupRows';
import { PanelRowControls } from './PanelRowControls';
import { useBoardSettle, panelBoardSignature } from './panel-write';
import { useDragListeners } from './use-drag-listeners';
import type { PanelMock } from './panel-mock';
import type { PanelPluginUnit, PanelUnit } from './use-panels';

interface DragState {
  readonly from: number;
  readonly over: number | null;
  readonly at?: { readonly x: number; readonly y: number } | undefined;
}

function rowBoxes(list: HTMLUListElement | null): DOMRect[] {
  return list === null ? [] : Array.from(list.children).map((item) => item.getBoundingClientRect());
}

function rowClass(row: PanelRow, index: number, drag: DragState | null): string {
  const parts = [styles.row];
  if (!row.shown) parts.push(styles.rowOff);
  if (drag !== null) parts.push(row.shown ? styles.rowDragging : styles.rowBlocked);
  if (drag?.over === index) parts.push(styles.rowOver);
  return parts.join(' ');
}

function gripClass(drag: DragState | null): string {
  if (drag === null) return styles.grip;
  return `${styles.grip} ${drag.over === null ? styles.gripBlocked : styles.gripDragging}`;
}

function RowLabel({ t, row }: { readonly t: Translate; readonly row: PanelRow }) {
  return (
    <span className={styles.label}>
      <span className={styles.name}>{t(row.titleKey ?? row.id)}</span>
      {row.badgeKey === undefined ? null : <span className={styles.dep}>{t(row.badgeKey)}</span>}
    </span>
  );
}

interface DragHandlers {
  readonly begin: (index: number, x: number, y: number) => void;
  readonly move: (x: number, y: number) => void;
  readonly drop: (y: number) => void;
  readonly cancel: () => void;
}

function PanelRowItem({
  t,
  row,
  index,
  drag,
  handlers,
  tipEpoch,
  busy,
  onWrite,
}: {
  readonly t: Translate;
  readonly row: PanelRow;
  readonly index: number;
  readonly drag: DragState | null;
  readonly handlers: DragHandlers;
  readonly tipEpoch: number;
  readonly busy: boolean;
  readonly onWrite: (body: Record<string, unknown>) => void;
}) {
  return (
    <li className={rowClass(row, index, drag)}>
      {row.shown && row.hasCard !== false ? (
        <Tip key={tipEpoch} label={t('panels.dragHint')} disabled={drag !== null}>
        <span
          className={gripClass(drag)}
          aria-hidden="true"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            handlers.begin(index, event.clientX, event.clientY);
          }}
        >
          ⠿
        </span>
        </Tip>
      ) : (
        <span aria-hidden="true" />
      )}
      <RowLabel t={t} row={row} />
      <PanelRowControls
        t={t}
        unit={row}
        label={t(row.titleKey ?? row.id)}
        busy={busy}
        onWrite={onWrite}
      />
    </li>
  );
}

function PanelEmpty({ t, onOpenMarket }: { readonly t: Translate; readonly onOpenMarket: () => void }) {
  return (
    <CenteredState
      compact
      icon={null}
      title={t('panels.noneInstalled')}
      hint={t('panels.noneInstalledHint')}
      action={
        <Button type="button" size="sm" variant="outline" onClick={onOpenMarket}>
          {t('panels.browseMarket')}
        </Button>
      }
    />
  );
}

function DragGhost({ label, at }: { readonly label: string; readonly at: { x: number; y: number } }) {
  return (
    <div className={styles.ghost} style={{ left: `${at.x + 12}px`, top: `${at.y - 12}px` }}>
      {label}
    </div>
  );
}

function ResetConfirmation({
  t,
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  readonly t: Translate;
  readonly open: boolean;
  readonly busy: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const close = (next: () => void): void => {
    setAcknowledged(false);
    next();
  };
  return (
    <RiskConfirmation
      open={open}
      title={t('panels.followAllConfirmTitle')}
      description={t('panels.followAllConfirmDetail')}
      acknowledgeLabel={t('panels.followAllConfirmAck')}
      cancelLabel={t('panels.followAllConfirmNo')}
      closeLabel={t('panels.followAllConfirmNo')}
      confirmLabel={t('panels.followAllConfirmYes')}
      acknowledged={acknowledged}
      disabled={busy}
      onAcknowledgedChange={setAcknowledged}
      onCancel={() => close(onCancel)}
      onConfirm={() => close(onConfirm)}
    />
  );
}

export interface ModulesPageProps {
  readonly t: Translate;
  readonly units: readonly PanelUnit[];
  readonly plugins?: readonly PanelPluginUnit[];
  readonly workspace: string | null;
  readonly capabilities: CapabilityMap | null;
  readonly loading?: boolean;
  readonly onOpenMarket: () => void;
  readonly mocked?: boolean;
  readonly mock?: PanelMock | undefined;
  readonly own?: boolean;
}

export function ModulesPage({
  t,
  units,
  plugins = [],
  workspace,
  capabilities,
  loading = false,
  onOpenMarket,
  mocked = false,
  mock,
  own = false,
}: ModulesPageProps) {
  const [drag, setDrag] = useState<DragState | null>(mock?.drag ?? null);
  const [tipEpoch, setTipEpoch] = useState(0);
  const [writing, setWriting] = useState(mock?.busy ?? false);
  const [failed, setFailed] = useState(mock?.failed ?? false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const listRef = useRef<HTMLUListElement | null>(null);
  const rows = selectPanelRows(units, plugins, capabilities);
  const modules: PanelRow[] = rows.filter((row) => !row.plugin);
  const carded: PanelRow[] = modules.filter((row) => row.hasCard !== false);
  const boardless: PanelRow[] = modules.filter((row) => row.hasCard === false);
  const pluginRows: PanelRow[] = rows.filter((row) => row.plugin);
  const empty = !loading && rows.length === 0;
  const settle = useBoardSettle(panelBoardSignature(units, plugins, own));
  const { busy } = useVisibleBusy(writing || settle.pending, MIN_BUSY_MS);

  const prefWrite = useHostWrite<unknown>({
    channel: 'prefs',
    resource: 'panels',
    networkText: t('panels.failed'),
  });

  const write = async (body: Record<string, unknown>): Promise<void> => {
    if (mocked) return;
    setWriting(true);
    setFailed(false);
    settle.begin();
    const outcome = await prefWrite.send({ ...body, ...(workspace === null ? {} : { path: workspace }) });
    setWriting(false);
    if (!outcome.ok) {
      settle.clear();
      setFailed(true);
    }
  };

  const writeRow = (body: Record<string, unknown>): void => void write(body);

  const dropTargetAt = (y: number): number | null =>
    panelDropTarget(carded, rowAtPoint(rowBoxes(listRef.current), y));

  const beginDrag = (index: number, x: number, y: number): void => {
    if (carded[index]?.shown !== true) return;
    setDrag({ from: index, over: index, at: { x, y } });
  };

  const trackDrag = (x: number, y: number): void => {
    if (drag === null) return;
    setDrag({ from: drag.from, over: dropTargetAt(y), at: { x, y } });
  };

  const settleDrag = (y: number): void => {
    const from = drag?.from;
    setDrag(null);
    setTipEpoch((epoch) => epoch + 1);
    if (from === undefined) return;
    const moved = carded[from];
    const over = dropTargetAt(y);
    if (moved === undefined || over === null || over === from) return;
    void write({ action: 'move', id: moved.id, index: over });
  };

  const cancelDrag = (): void => {
    setDrag(null);
    setTipEpoch((epoch) => epoch + 1);
  };

  const handlers: DragHandlers = { begin: beginDrag, move: trackDrag, drop: settleDrag, cancel: cancelDrag };
  useDragListeners(drag !== null, handlers);

  const dragged = drag === null ? undefined : carded[drag.from];
  const ghost =
    drag?.at === undefined || dragged === undefined ? null : (
      <DragGhost label={t(dragged.titleKey ?? dragged.id)} at={drag.at} />
    );

  return (
    <>
      {ghost}
      {empty ? <PanelEmpty t={t} onOpenMarket={onOpenMarket} /> : null}

      {carded.length === 0 ? null : (
        <ul ref={listRef} className={`${styles.list}${drag === null ? '' : ` ${styles.listDragging}`}`}>
        {carded.map((row, index) => (
          <PanelRowItem
            key={row.id}
            t={t}
            row={row}
            index={index}
            drag={drag}
            handlers={handlers}
            tipEpoch={tipEpoch}
            busy={busy}
            onWrite={writeRow}
          />
        ))}
        </ul>
      )}

      <PanelGroupRows t={t} rows={boardless} titleKey="panels.groupBoardless" busy={busy} onWrite={writeRow} />
      <PanelGroupRows t={t} rows={pluginRows} titleKey="panels.groupPlugins" busy={busy} onWrite={writeRow} />

      {own ? (
        <PanelFoot>
          <button
            type="button"
            className={styles.reset}
            disabled={busy}
            onClick={() => setConfirmingReset(true)}
          >
            {t('panels.followAll')}
          </button>
        </PanelFoot>
      ) : null}

      <ResetConfirmation
        t={t}
        open={confirmingReset}
        busy={busy}
        onCancel={() => setConfirmingReset(false)}
        onConfirm={() => {
          setConfirmingReset(false);
          void write({ action: 'reset' });
        }}
      />

      {failed ? <p className={styles.error}>{t('panels.failed')}</p> : null}
    </>
  );
}
