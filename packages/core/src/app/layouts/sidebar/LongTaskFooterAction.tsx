import { createElement as h, useEffect, useRef, useState } from 'react';
import type { ShellLongTaskRow, Translate } from '@dsh-workbench/shared';
import {
  answerRouteOf,
  longTaskDot,
  longTaskIsLive,
  pathBase,
  recheckRouteOf,
  seenRouteOf,
  stopRouteOf,
} from '@dsh-workbench/shared';
import {
  IconChecklistOutlineRegular,
  IconFolderCloseRegular,
  Menu,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { postWrite } from '@/shared/hooks/use-host-write';
import { useExternalActions } from '@/shared/hooks/use-external-actions';
import { useShellLongTasks } from '@/shared/hooks/use-shell-long-tasks';
import { SchemaLongTaskView } from '@/shared/components/long-task/SchemaLongTaskView';
import type { SchemaLongTaskViewProps } from '@/shared/components/long-task/SchemaLongTaskView';
import styles from './LongTaskFooterAction.module.css';

export interface LongTaskFooterActionProps {
  readonly wide?: boolean | undefined;
  readonly t: Translate;
  readonly pickWorkspacePath?: ((path: string) => void) | undefined;
}

type DoneKind = 'stop' | 'recheck' | 'answer';

interface Busy {
  readonly kind: DoneKind;
  readonly id: string;
}

interface Failed extends Busy {
  readonly text: string;
}

const NETWORK: Readonly<Record<DoneKind, string>> = {
  stop: '网络不通，停止请求没发出去',
  recheck: '网络不通，重查请求没发出去',
  answer: '网络不通，回执没交出去',
};

const URL_PATTERN = /^https?:\/\//i;

function failedTextOf(failed: Failed | null, kind: DoneKind, id: string): string | null {
  return failed?.kind === kind && failed.id === id ? failed.text : null;
}

function resourceOf(kind: DoneKind, unit: string): string {
  if (kind === 'stop') return stopRouteOf(unit);
  if (kind === 'recheck') return recheckRouteOf(unit);
  return answerRouteOf(unit);
}

export function ackableLongTaskRows(rows: readonly ShellLongTaskRow[]): ShellLongTaskRow[] {
  return rows.filter((row) => !longTaskIsLive(row.status) && row.seen !== true);
}

export function LongTaskFooterAction({
  wide,
  t,
  pickWorkspacePath,
}: LongTaskFooterActionProps) {
  const rows = useShellLongTasks();
  const openOf = (path: string): (() => void) | undefined => {
    if (pickWorkspacePath === undefined) return undefined;
    return () => {
      setOpen(false);
      pickWorkspacePath(path);
    };
  };
  const external = useExternalActions(() => undefined);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const acked = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    for (const row of ackableLongTaskRows(rows)) {
      if (acked.current.has(row.id)) continue;
      acked.current.add(row.id);
      void postWrite(
        'actions',
        seenRouteOf(row.unit),
        { id: row.id },
        '网络不通，标记为已查看的请求没发出去',
      ).then((outcome) => {
        if (!outcome.ok) acked.current.delete(row.id);
      });
    }
  }, [open, rows]);

  if (rows.length === 0) return null;

  const waiting = rows.some((row) => row.status === 'needs-human' || row.status === 'needs-login');
  const states = rows
    .filter((row) => longTaskIsLive(row.status) || row.seen !== true)
    .map((row) => longTaskDot(row.status));
  const dotState = waiting
    ? 'warning'
    : states.includes('ongoing')
      ? 'ongoing'
      : states.includes('error')
        ? 'error'
        : states.includes('done')
          ? 'done'
          : 'idle';
  const byWorkspace = new Map<string, Map<string, ShellLongTaskRow[]>>();
  for (const row of rows) {
    const units = byWorkspace.get(row.workspace) ?? new Map<string, ShellLongTaskRow[]>();
    const list = units.get(row.unit) ?? [];
    list.push(row);
    units.set(row.unit, list);
    byWorkspace.set(row.workspace, units);
  }
  const groups = [...byWorkspace].sort(([a], [b]) => a.localeCompare(b));
  const orderOf = (status: ShellLongTaskRow['status']): number =>
    status === 'needs-human' || status === 'needs-login' ? 0 : status === 'running' ? 1 : 2;
  const orderedRows = (list: readonly ShellLongTaskRow[]): ShellLongTaskRow[] =>
    [...list].sort((a, b) => {
      const byStatus = orderOf(a.status) - orderOf(b.status);
      return byStatus !== 0 ? byStatus : (b.startedAt ?? '').localeCompare(a.startedAt ?? '');
    });

  const run = async (kind: DoneKind, row: ShellLongTaskRow, body: Record<string, unknown>): Promise<void> => {
    setBusy({ kind, id: row.id });
    setFailed(null);
    try {
      const outcome = await postWrite('actions', resourceOf(kind, row.unit), body, NETWORK[kind]);
      if (!outcome.ok) setFailed({ kind, id: row.id, text: outcome.message });
    } finally {
      setBusy((current) => (current?.kind === kind && current.id === row.id ? null : current));
    }
  };

  const busyIdOf = (kind: DoneKind, id: string): string | null =>
    busy?.kind === kind && busy.id === id ? id : null;
  const openSafe = (url: string): void => {
    if (URL_PATTERN.test(url)) external.open(url);
  };

  const entry = h(
    'button',
    {
      type: 'button',
      className: wide === true ? styles.entryWide : styles.entry,
      'aria-label': t('longTask.list.entry', { n: rows.length }),
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      ...(wide === true ? {} : { title: t('longTask.list.title') }),
      onClick: () => setOpen((value) => !value),
    },
    wide === true
      ? h('span', { className: styles.dot }, h(StateDot, { state: dotState }))
      : h(
          'span',
          { className: styles.icon, 'aria-hidden': true },
          h(IconChecklistOutlineRegular, { size: 16 }),
          dotState === 'idle'
            ? null
            : h(
                'span',
                { className: styles.badge },
                dotState === 'ongoing'
                  ? h('span', { className: styles.badgeBusy })
                  : h(StateDot, { state: dotState, size: 8 }),
              ),
        ),
    wide === true
      ? h('span', { className: styles.label }, t('longTask.list.entry', { n: rows.length }))
      : null,
  );

  const wiringOf = (
    row: ShellLongTaskRow,
  ): Pick<
    SchemaLongTaskViewProps,
    'stopping' | 'stopFailed' | 'rechecking' | 'recheckFailed' | 'answering' | 'answerFailed'
  > => ({
    stopping: busyIdOf('stop', row.id),
    stopFailed: failedTextOf(failed, 'stop', row.id),
    rechecking: busyIdOf('recheck', row.id),
    recheckFailed: failedTextOf(failed, 'recheck', row.id),
    answering: busyIdOf('answer', row.id),
    answerFailed: failedTextOf(failed, 'answer', row.id),
  });

  const rowOf = (row: ShellLongTaskRow): JSX.Element =>
    h(SchemaLongTaskView, {
      key: row.id,
      rows: [row],
      ...wiringOf(row),
      t,
      onStop: (id: string) => {
        void run('stop', row, { id });
      },
      onRecheck: (id: string) => {
        void run('recheck', row, { id });
      },
      onAnswer: (id: string, values: Readonly<Record<string, string>>) => {
        void run('answer', row, { id, values });
      },
      onLogin: openSafe,
      onOpenUrl: openSafe,
      onCopy: external.copy,
      copied: external.copied,
      dense: true,
    });

  return h(
    Menu,
    {
      open,
      onClose: () => setOpen(false),
      portal: true,
      autoFocus: true,
      className: wide === true ? styles.anchorWide : styles.anchor,
      listClassName: styles.menu,
      anchor: entry,
    },
    h('div', { className: styles.title }, t('longTask.list.title')),
    h(
      'div',
      { className: styles.list },
      ...groups.map(([workspace, units]) =>
        h(
          'section',
          { key: workspace, className: styles.group },
          h(
            'div',
            { className: styles.groupTitle, title: workspace },
            h(
              openOf(workspace) === undefined ? 'span' : 'button',
              {
                className: openOf(workspace) === undefined ? styles.groupHead : styles.groupOpen,
                ...(openOf(workspace) === undefined
                  ? {}
                  : {
                      type: 'button',
                      'aria-label': t('longTask.list.openWorkspace', {
                        name: pathBase(workspace) || workspace,
                      }),
                      onClick: openOf(workspace),
                    }),
              },
              h('span', { className: styles.groupIcon }, h(IconFolderCloseRegular, { size: 14 })),
              h('span', { className: styles.groupName }, pathBase(workspace) || workspace),
            ),
            h(
              'span',
              { className: styles.groupCount },
              t('longTask.list.count', {
                n: [...units.values()].reduce((sum, list) => sum + list.length, 0),
              }),
            ),
          ),
          h(
            'div',
            { className: styles.units },
            ...[...units].map(([unit, unitRows]) =>
              h(
                'div',
                { key: unit, className: styles.unit },
                h('div', { className: styles.unitTitle }, unit),
                ...orderedRows(unitRows).map((row) => rowOf(row)),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
