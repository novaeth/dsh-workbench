import { createElement as h, Fragment } from 'react';
import type {
  CardViewLongTask,
  LongTaskRowIntervention,
  LongTaskRowInterventionAction,
  ShellLongTaskRow,
  Translate,
} from '@dsh-workbench/shared';
import { LongTaskRow, longTaskIsLive } from '@dsh-workbench/shared';

const URL_PATTERN = /^https?:\/\//i;

export interface SchemaLongTaskViewProps {
  readonly rows: readonly ShellLongTaskRow[];
  readonly overrides?: readonly CardViewLongTask[] | undefined;
  readonly stopping: string | null;
  readonly stopFailed: string | null;
  readonly rechecking: string | null;
  readonly recheckFailed: string | null;
  readonly t: Translate;
  readonly onStop: (id: string) => void;
  readonly onRecheck: (id: string) => void;
  readonly onLogin: (url: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCopy: (text: string) => void;
  readonly copied?: string | null | undefined;
}

function interventionOf(
  row: ShellLongTaskRow,
  t: Translate,
  onOpenUrl: (url: string) => void,
  onCopy: (text: string) => void,
  copied: string | null,
  onRecheck: (id: string) => void,
  rechecking: string | null,
  recheckFailed: string | null,
): LongTaskRowIntervention | undefined {
  const intervention = row.intervention;
  if (row.status !== 'needs-human' || intervention === undefined) return undefined;
  const actions: LongTaskRowInterventionAction[] = [];
  let primary = true;
  (intervention.actions ?? []).forEach((action, index) => {
    if (action.kind === 'open-url') {
      if (!URL_PATTERN.test(action.url)) return;
      actions.push({
        key: `${row.id}:${index}:open-url`,
        label: action.label ?? t('longTask.act.open'),
        ...(primary ? { primary: true } : {}),
        onPress: () => onOpenUrl(action.url),
      });
      primary = false;
      return;
    }
    actions.push({
      key: `${row.id}:${index}:copy`,
      label: copied === action.text ? t('env.copied') : action.label ?? t('longTask.act.copy'),
      onPress: () => onCopy(action.text),
    });
  });
  if (row.resumable === true) {
    actions.push({
      key: `${row.id}:handled`,
      label: t('longTask.handled'),
      busy: rechecking === row.id,
      onPress: () => onRecheck(row.id),
    });
  }
  return {
    title: intervention.title,
    ...(intervention.hint === undefined ? {} : { hint: intervention.hint }),
    ...(actions.length === 0 ? {} : { actions }),
    ...(recheckFailed === null ? {} : { failed: recheckFailed }),
  };
}

export function SchemaLongTaskView({
  rows,
  overrides,
  stopping,
  stopFailed,
  rechecking,
  recheckFailed,
  t,
  onStop,
  onRecheck,
  onLogin,
  onOpenUrl,
  onCopy,
  copied,
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
      const intervention = interventionOf(row, t, onOpenUrl, onCopy, copied ?? null, onRecheck, rechecking, recheckFailed);
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
        ...(intervention === undefined ? {} : { intervention }),
        ...(stop === undefined ? {} : { stop }),
      });
    }),
  );
}
