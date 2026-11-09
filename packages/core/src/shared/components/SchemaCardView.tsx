import { createElement as h, Fragment, useState, type ReactNode } from 'react';
import type {
  BoardModuleProps,
  CardView,
  CardViewActivity,
  CardViewMetric,
  CardViewModel,
  CardViewRow,
  CardViewTone,
  ModuleBlocker,
  ShellLongTaskRow,
  Translate,
} from '@dsh-workbench/shared';
import {
  ActivityBlock,
  ActivityLine,
  Card,
  CardHead,
  EmptyState,
  Link,
  Row,
  Rows,
  SkeletonRows,
  StateBlock,
} from '@dsh-workbench/shared';
import { StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ResourceState } from '@/shared/hooks/use-api-resource';
import { BlockerState } from './BlockerState';
import { SchemaActions } from './SchemaActions';
import { SchemaLongTaskView } from './SchemaLongTaskView';
import { SchemaMetric } from './SchemaMetric';
import { SchemaRow } from './SchemaRow';
import { SchemaSettings } from './SchemaSettings';
import styles from './SchemaRows.module.css';

export interface SchemaCardViewProps extends BoardModuleProps {
  readonly unit: string;
  readonly view: CardView;
  readonly state: ResourceState<unknown>;
  readonly refreshing: boolean;
  readonly blocker?: ModuleBlocker | undefined;
  readonly longTasks?: readonly ShellLongTaskRow[] | undefined;
  readonly longTaskStopping?: string | null | undefined;
  readonly longTaskStopFailed?: string | null | undefined;
  readonly onLongTaskStop?: ((id: string) => void) | undefined;
  readonly longTaskRechecking?: string | null | undefined;
  readonly longTaskRecheckFailed?: string | null | undefined;
  readonly onLongTaskRecheck?: ((id: string) => void) | undefined;
  readonly onLongTaskLogin?: ((url: string) => void) | undefined;
  readonly onLongTaskOpenUrl?: ((url: string) => void) | undefined;
  readonly onLongTaskCopy?: ((text: string) => void) | undefined;
  readonly longTaskCopied?: string | null | undefined;
}

const DOT_STATE: Record<CardViewTone, StateDotState> = {
  neutral: 'idle',
  ok: 'done',
  warn: 'warning',
  bad: 'error',
  busy: 'ongoing',
};

function toneDot(tone: CardViewTone | undefined, size = 8) {
  return tone === undefined ? undefined : h(StateDot, { state: DOT_STATE[tone], size });
}

function actionNodes(view: CardView, t: Translate, onRefresh: () => void) {
  const actions = view.actions ?? [];
  return actions.length === 0 ? undefined : h(SchemaActions, { actions, t, onRefresh });
}

function framed(content: ReactNode, actions: ReactNode | undefined) {
  return actions === undefined ? content : h(StateBlock, { actions }, content);
}

function modelOf(view: CardView, payload: unknown): CardViewModel<unknown> {
  return view.read.map(payload);
}

function labelOf(item: CardViewMetric, t: Translate): string {
  return item.label ?? (item.labelKey === undefined ? '' : t(item.labelKey));
}

function metricsOf(items: readonly CardViewMetric[], t: Translate, onRefresh: () => void) {
  return h(
    Rows,
    null,
    ...items.map((item, index) => {
      const key = item.key ?? item.labelKey ?? item.label ?? String(index);
      return item.percent === undefined
        ? h(Row, {
            key,
            label:
              item.tone === undefined
                ? labelOf(item, t)
                : h(Fragment, null, toneDot(item.tone), labelOf(item, t)),
            value:
              item.actions === undefined
                ? item.value
                : h(
                    Fragment,
                    null,
                    item.value,
                    h(SchemaActions, { actions: item.actions, t, onRefresh }),
                  ),
          })
        : h(SchemaMetric, {
            key,
            label:
              item.tone === undefined
                ? labelOf(item, t)
                : h(Fragment, null, toneDot(item.tone), labelOf(item, t)),
            value: item.value,
            percent: item.percent,
            ...(item.actions === undefined
              ? {}
              : { actions: h(SchemaActions, { actions: item.actions, t, onRefresh }) }),
            ...(item.tone === undefined ? {} : { tone: item.tone }),
          });
    }),
  );
}

function rowsOf(items: readonly CardViewRow[], t: Translate, onRefresh: () => void) {
  const atClass = (tone: CardViewTone | undefined): string | undefined => {
    if (tone === undefined) return undefined;
    return tone === 'warn'
      ? styles.activityAtWarn
      : tone === 'bad'
        ? styles.activityAtBad
        : tone === 'ok'
          ? styles.activityAtOk
          : tone === 'busy'
            ? styles.activityAtBusy
            : undefined;
  };
  return h(
    'div',
    { className: styles.rows },
    ...items.map((item) => {
      const title = item.title ?? (item.titleKey === undefined ? '' : t(item.titleKey));
      const actions =
        item.actions === undefined
          ? undefined
          : h(SchemaActions, { actions: item.actions, t, onRefresh });
      if (item.layout === 'activity') {
        const at =
          item.at === undefined
            ? undefined
            : h(
                'span',
                { className: atClass(item.atTone), ...(item.atTitle === undefined ? {} : { title: item.atTitle }) },
                item.at,
              );
        return h(ActivityLine, {
          key: item.key,
          dot: toneDot(item.tone, 10),
          text: h(
            'span',
            { className: styles.activityText },
            h('span', { className: styles.activityTitle, title }, title),
            item.meta === undefined
              ? null
              : h('span', { className: styles.activityMeta }, item.meta),
          ),
          ...(at === undefined ? {} : { at }),
          ...(actions === undefined ? {} : { actions }),
        });
      }
      return h(SchemaRow, {
        key: item.key,
        title,
        meta: item.meta,
        at: item.at,
        atTone: item.atTone,
        atTitle: item.atTitle,
        dot: toneDot(item.tone, 10),
        href: item.href,
        ...(item.action === undefined
          ? {}
          : { action: h(Link, { href: item.action.href }, t(item.action.labelKey)) }),
        ...(actions === undefined ? {} : { actions }),
      });
    }),
  );
}

function activityOf(items: readonly CardViewActivity[], t: Translate) {
  return h(
    ActivityBlock,
    null,
    ...items.map((item) =>
      h(ActivityLine, {
        key: item.key,
        dot: toneDot(item.tone),
        text: item.text ?? (item.textKey === undefined ? '' : t(item.textKey)),
        at: item.at,
      }),
    ),
  );
}

function sectionsOf(view: CardView, model: unknown, t: Translate, onRefresh: () => void) {
  const sections = view.sections;
  if (sections === undefined) return [];

  const nodes: ReactNode[] = [];
  for (const key of sections.order ?? ['metrics', 'rows', 'activity']) {
    if (key === 'metrics') {
      const metrics = sections.metrics?.(model, t);
      if (metrics !== undefined && metrics.length > 0) {
        nodes.push(h(Fragment, { key: 'metrics' }, metricsOf(metrics, t, onRefresh)));
      }
    }
    if (key === 'rows') {
      const rows = sections.rows?.(model, t);
      if (rows !== undefined && rows.length > 0) {
        nodes.push(h(Fragment, { key: 'rows' }, rowsOf(rows, t, onRefresh)));
      }
    }
    if (key === 'activity') {
      const activity = sections.activity?.(model, t);
      if (activity !== undefined && activity.length > 0) {
        nodes.push(h(Fragment, { key: 'activity' }, activityOf(activity, t)));
      }
    }
  }
  return nodes;
}

function contentOf(
  state: ResourceState<unknown>,
  mapped: CardViewModel<unknown> | undefined,
  view: CardView,
  props: Omit<SchemaCardViewProps, 'view' | 'state' | 'refreshing' | 'blocker'>,
  actions: ReactNode | undefined,
  settingsOpen: boolean,
  onSettingsClose: () => void,
  longTask: ReactNode | undefined,
) {
  if (state.phase === 'error') {
    return h(Fragment, null, h(StateBlock, { hint: state.error?.message }), longTask);
  }
  if (mapped === undefined && state.phase === 'idle' && view.idleKey !== undefined) {
    return h(
      Fragment,
      null,
      framed(h(EmptyState, { text: props.t(view.idleKey), compact: true }), actions),
      longTask,
    );
  }
  if (mapped === undefined) {
    return h(Fragment, null, h(SkeletonRows, { rows: 3 }), longTask);
  }
  if (mapped.phase === 'empty') {
    return h(
      Fragment,
      null,
      framed(h(EmptyState, { text: props.t(mapped.hintKey) }), actions),
      longTask,
    );
  }
  if (settingsOpen && view.settings !== undefined) {
    return h(
      Fragment,
      null,
      h(SchemaSettings, {
        settings: view.settings,
        model: mapped.model,
        host: props,
        t: props.t,
        onSaved: () => {
          onSettingsClose();
          props.onRefresh();
        },
        onCancel: onSettingsClose,
      }),
      longTask,
    );
  }

  const custom =
    view.custom === undefined
      ? undefined
      : view.custom({
          ...props,
          model: mapped.model,
        });
  const sections = sectionsOf(view, mapped.model, props.t, props.onRefresh);
  return h(
    Fragment,
    null,
    ...(view.sections?.frame === true
      ? [h(StateBlock, { key: 'sections' }, ...sections)]
      : sections),
    ...(custom === undefined ? [] : [custom]),
    longTask,
  );
}

export function SchemaCardView({
  unit,
  view,
  state,
  refreshing,
  blocker,
  longTasks,
  longTaskStopping,
  longTaskStopFailed,
  onLongTaskStop,
  longTaskRechecking,
  longTaskRecheckFailed,
  onLongTaskRecheck,
  onLongTaskLogin,
  onLongTaskOpenUrl,
  onLongTaskCopy,
  longTaskCopied,
  world,
  refreshToken,
  onRefresh,
  onNavigate,
  onOpenMarket,
  onSummary,
  t,
}: SchemaCardViewProps) {
  const [gearOpen, setGearOpen] = useState(false);
  const [autoDismissed, setAutoDismissed] = useState(false);
  const mapped = state.value === undefined ? undefined : modelOf(view, state.value);
  const model = mapped?.phase === 'ready' ? mapped.model : undefined;
  const autoOpen =
    model !== undefined &&
    !autoDismissed &&
    view.settings?.openWhen?.(model) === true;
  const settingsOpen = gearOpen || autoOpen;
  const closeSettings = (): void => {
    setGearOpen(false);
    if (autoOpen) setAutoDismissed(true);
  };
  const longTask =
    view.sections?.longTask === undefined
      ? undefined
      : h(SchemaLongTaskView, {
          rows: longTasks ?? [],
          ...(model === undefined ? {} : { overrides: view.sections.longTask(model, t) }),
          stopping: longTaskStopping ?? null,
          stopFailed: longTaskStopFailed ?? null,
          rechecking: longTaskRechecking ?? null,
          recheckFailed: longTaskRecheckFailed ?? null,
          t,
          onStop: onLongTaskStop ?? (() => {}),
          onRecheck: onLongTaskRecheck ?? (() => {}),
          onLogin: onLongTaskLogin ?? (() => {}),
          onOpenUrl: onLongTaskOpenUrl ?? (() => {}),
          onCopy: onLongTaskCopy ?? (() => {}),
          copied: longTaskCopied ?? null,
        });
  const actions = actionNodes(view, t, onRefresh);
  const settings = view.settings;
  const platform = model === undefined
    ? view.platform
    : (view.platformOf?.(model) ?? view.platform);
  const head = h(CardHead, {
    t,
    title: t(view.titleKey),
    ...(model === undefined ? {} : { meta: view.meta?.(model, t) }),
    refreshing,
    onRefresh,
    ...(platform === undefined
      ? {}
      : { platformHref: platform.href, platform: t(platform.labelKey) }),
    ...(settings === undefined
      ? {}
      : {
          gear: t(settings.gearKey),
          gearOpen: settingsOpen,
          onToggleGear: () => {
            if (settingsOpen) closeSettings();
            else setGearOpen(true);
          },
        }),
  });
  const body =
    blocker === undefined
      ? contentOf(
          state,
          mapped,
          view,
          { unit, world, refreshToken, onRefresh, onNavigate, onOpenMarket, onSummary, t },
          actions,
          settingsOpen,
          closeSettings,
          longTask,
        )
      : h(
          Fragment,
          null,
          h(BlockerState, {
            blocker,
            t,
            onRetry: onRefresh,
            busy: refreshing,
            flush: true,
          }),
          longTask,
        );

  return h(Card, { t, title: t(view.titleKey), refreshing, onRefresh, head }, body);
}
