import { createElement as h, Fragment } from 'react';
import dayjs from 'dayjs';
import type {
  CardViewLongTask,
  LongTaskRowIntervention,
  LongTaskRowInterventionAction,
  LongTaskStatus,
  ShellLongTaskRow,
  Translate,
} from '@dsh-workbench/shared';
import { LONG_TASK_LINK_MAX, LongTaskRow, longTaskIsLive } from '@dsh-workbench/shared';

const URL_PATTERN = /^https?:\/\//i;

const STATE_KEYS: Readonly<Record<LongTaskStatus, string>> = {
  running: 'longTask.state.running',
  'needs-human': 'longTask.state.needsHuman',
  'needs-login': 'longTask.state.needsLogin',
  stopped: 'longTask.state.stopped',
  ok: 'longTask.state.ok',
  failed: 'longTask.state.failed',
};

function durationText(t: Translate, ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return t('longTask.duration.hourMin', { h: hours, m: minutes });
  if (minutes > 0) return t('longTask.duration.minSec', { m: minutes, s: seconds });
  return t('longTask.duration.sec', { s: seconds });
}

function linksOf(
  row: ShellLongTaskRow,
  override: CardViewLongTask | undefined,
  t: Translate,
): readonly { readonly href: string; readonly text: string }[] | undefined {
  const links: { href: string; text: string }[] = [];
  const seen = new Set<string>();
  for (const link of row.links ?? []) {
    if (!URL_PATTERN.test(link.href) || seen.has(link.href)) continue;
    seen.add(link.href);
    links.push({ href: link.href, text: link.text });
  }
  for (const link of override?.links ?? []) {
    if (!URL_PATTERN.test(link.href) || seen.has(link.href)) continue;
    seen.add(link.href);
    links.push({ href: link.href, text: t(link.labelKey) });
  }
  return links.length === 0 ? undefined : links.slice(0, LONG_TASK_LINK_MAX);
}

function metaOf(row: ShellLongTaskRow, t: Translate, now: number): string {
  const state = t(STATE_KEYS[row.status]);
  const started = row.startedAt === undefined ? Number.NaN : dayjs(row.startedAt).valueOf();
  const ended = longTaskIsLive(row.status) ? now : dayjs(row.at).valueOf();
  const elapsed =
    Number.isFinite(started) && Number.isFinite(ended) && ended >= started
      ? ended - started
      : null;
  return elapsed === null ? state : `${state} · ${durationText(t, elapsed)}`;
}

export interface SchemaLongTaskViewProps {
  readonly rows: readonly ShellLongTaskRow[];
  readonly overrides?: readonly CardViewLongTask[] | undefined;
  readonly stopping: string | null;
  readonly stopFailed: string | null;
  readonly rechecking: string | null;
  readonly recheckFailed: string | null;
  readonly answering: string | null;
  readonly answerFailed: string | null;
  readonly t: Translate;
  readonly onStop: (id: string) => void;
  readonly onRecheck: (id: string) => void;
  readonly onAnswer: (id: string, values: Readonly<Record<string, string>>) => void;
  readonly onLogin: (url: string) => void;
  readonly onOpenUrl: (url: string) => void;
  readonly onCopy: (text: string) => void;
  readonly copied?: string | null | undefined;
  readonly dense?: boolean | undefined;
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
  onAnswer: (id: string, values: Readonly<Record<string, string>>) => void,
  answering: string | null,
  answerFailed: string | null,
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
  const fields = intervention.fields ?? [];
  const withForm = row.answerable === true && fields.length > 0;
  return {
    title: intervention.title,
    ...(intervention.hint === undefined ? {} : { hint: intervention.hint }),
    ...(actions.length === 0 ? {} : { actions }),
    ...(withForm
      ? {
          fields,
          submit: {
            label: intervention.submitLabel ?? t('longTask.submit'),
            busy: answering === row.id,
            failed: answerFailed,
            onSubmit: (values: Readonly<Record<string, string>>) => onAnswer(row.id, values),
          },
        }
      : {}),
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
  answering,
  answerFailed,
  t,
  onStop,
  onRecheck,
  onAnswer,
  onLogin,
  onOpenUrl,
  onCopy,
  copied,
  dense,
}: SchemaLongTaskViewProps) {
  const byId =
    overrides === undefined ? undefined : new Map(overrides.map((override) => [override.id, override]));
  const shown = byId === undefined ? rows : rows.filter((row) => byId.has(row.id));
  if (shown.length === 0) return null;
  const now = dayjs().valueOf();

  return h(
    Fragment,
    null,
    ...shown.map((row) => {
      const override = byId?.get(row.id);
      const stepText = row.step ?? '';
      const headline = override?.headline ?? row.headline ?? (stepText === '' ? row.target : stepText);
      const loginUrl = row.loginUrl;
      const login =
        row.status === 'needs-login' && loginUrl !== undefined
          ? { label: t('longTask.login'), onOpen: () => onLogin(loginUrl) }
          : undefined;
      const intervention = interventionOf(
        row,
        t,
        onOpenUrl,
        onCopy,
        copied ?? null,
        onRecheck,
        rechecking,
        recheckFailed,
        onAnswer,
        answering,
        answerFailed,
      );
      const stop = longTaskIsLive(row.status)
        ? {
            onStop: () => onStop(row.id),
            label: t('longTask.stop', { label: headline }),
            askLabel: t('longTask.stopConfirm'),
            armedLabel: t('longTask.stopArmed'),
            pending: t('longTask.stopPending'),
            busy: stopping === row.id,
            ...(stopFailed === null ? {} : { failed: stopFailed }),
          }
        : undefined;
      const step =
        row.status === 'running' || row.status === 'stopped' ? row.step : undefined;
      const dot =
        row.status === 'needs-human' || row.status === 'needs-login' ? 'warning' : undefined;
      const links = linksOf(row, override, t);
      const seenSteps = new Set(
        (row.history ?? [])
          .map((one) => one.stepId)
          .filter((one) => one !== undefined),
      );
      const pending = (row.plan ?? [])
        .filter((step) => !seenSteps.has(step.id))
        .map((step) => step.title ?? step.id);
      const progressText =
        row.progress === undefined
          ? ''
          : t('longTask.progress.text', { done: row.progress.done, total: row.progress.total });
      const meta =
        dense === true && progressText !== '' ? `${metaOf(row, t, now)} · ${progressText}` : metaOf(row, t, now);
      return h(LongTaskRow, {
        key: row.id,
        status: row.status,
        headline,
        ...(step === undefined || step === '' ? {} : { step }),
        meta,
        ...(dot === undefined ? {} : { dot }),
        dotLabel: t(STATE_KEYS[row.status]),
        attemptLabel: (attempt: number) => t('longTask.attempt', { attempt }),
        ...(row.status === 'failed' && row.why !== undefined ? { problem: row.why } : {}),
        ...(links === undefined ? {} : { links }),
        stepsTitle: t('longTask.steps'),
        ...(row.steps === undefined ? {} : { steps: row.steps }),
        ...(row.history === undefined ? {} : { history: row.history }),
        ...(login === undefined ? {} : { login }),
        ...(intervention === undefined ? {} : { intervention }),
        ...(stop === undefined ? {} : { stop }),
        ...(row.progress === undefined ? {} : { progress: row.progress }),
        ...(pending.length === 0 ? {} : { pending }),
        progressLabel: t('longTask.progress.label'),
        ...(dense === true ? { dense: true } : {}),
      });
    }),
  );
}
