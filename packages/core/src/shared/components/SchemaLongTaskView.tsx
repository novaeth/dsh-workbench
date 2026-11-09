import { createElement as h, Fragment } from 'react';
import type { CardViewLongTask, ShellLongTaskRow, Translate } from '@dsh-workbench/shared';
import { LongTaskRow, longTaskIsLive } from '@dsh-workbench/shared';

export interface SchemaLongTaskViewProps {
  readonly rows: readonly ShellLongTaskRow[];
  readonly overrides?: readonly CardViewLongTask[] | undefined;
  readonly stopping: string | null;
  readonly stopFailed: string | null;
  readonly t: Translate;
  readonly onStop: (id: string) => void;
  readonly onLogin: (url: string) => void;
}

export function SchemaLongTaskView({
  rows,
  overrides,
  stopping,
  stopFailed,
  t,
  onStop,
  onLogin,
}: SchemaLongTaskViewProps) {
  const byId =
    overrides === undefined ? undefined : new Map(overrides.map((override) => [override.id, override]));
  const shown = byId === undefined ? rows : rows.filter((row) => byId.has(row.id));
  if (shown.length === 0) return null;

  return h(
    Fragment,
    null,
    ...shown.map((row) => {
      const override = byId?.get(row.id);
      const headline = override?.headline ?? row.headline ?? row.target;
      const loginUrl = row.loginUrl;
      const login =
        row.status === 'needs-login' && loginUrl !== undefined
          ? { label: t('longTask.login'), onOpen: () => onLogin(loginUrl) }
          : undefined;
      const stop = longTaskIsLive(row.status)
        ? {
            onStop: () => onStop(row.id),
            label: t('longTask.stop', { label: headline }),
            askLabel: t('longTask.stopConfirm'),
            armedLabel: t('longTask.stopArmed'),
            busy: stopping === row.id,
            ...(stopFailed === null ? {} : { failed: stopFailed }),
          }
        : undefined;
      return h(LongTaskRow, {
        key: row.id,
        status: row.status,
        headline,
        ...(row.status === 'failed' && row.why !== undefined ? { problem: row.why } : {}),
        ...(override?.links === undefined
          ? {}
          : { links: override.links.map((link) => ({ href: link.href, text: t(link.labelKey) })) }),
        ...(row.status === 'failed' && row.steps !== undefined && row.steps.length > 0
          ? { steps: row.steps, stepsTitle: t('longTask.steps') }
          : {}),
        ...(login === undefined ? {} : { login }),
        ...(stop === undefined ? {} : { stop }),
      });
    }),
  );
}
