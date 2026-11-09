import { createElement as h, Fragment, useEffect, useState } from 'react';
import type { BoardModuleProps, CardView, ShellLongTaskRow } from '@dsh-workbench/shared';
import { Card, CardHead } from '@dsh-workbench/shared';
import { blockerOfError } from '@dsh-workbench/shared';
import { useApiResource } from '@/shared/hooks/use-api-resource';
import { useCapabilityGate } from '@/shared/hooks/use-capability-gate';
import { useLongTask } from '@/shared/hooks/use-long-task';
import { SchemaLongTaskView } from './SchemaLongTaskView';
import { watchLoginReturn } from '@/shared/hooks/login-return';
import { useUnitBoard, type CardFeed } from '@/shared/hooks/use-unit-board';
import { SchemaCardView } from './SchemaCardView';

export interface SchemaCardProps extends BoardModuleProps {
  readonly unit: string;
  readonly view: CardView;
}

function useCardFeed(
  view: CardView,
  query: Readonly<Record<string, string | number | boolean | undefined>>,
  enabled: boolean,
  refreshToken: number,
): CardFeed {
  const state = useApiResource<unknown>(view.read.route, query, refreshToken, {
    enabled,
    ...(view.read.fact === undefined ? {} : { fact: view.read.fact }),
  });
  return { state, refreshing: state.phase === 'loading', at: state.at ?? null };
}

export function SchemaCard(props: SchemaCardProps) {
  return props.view.customBody === undefined
    ? h(SchemaReadCard, props)
    : h(SchemaFrameCard, props);
}

function useCardLongTasks(
  unit: string,
  workspace: string | null,
  enabled: boolean,
): {
  readonly longTasks: ReturnType<typeof useLongTask<ShellLongTaskRow>>;
  readonly openLogin: (url: string) => void;
} {
  const longTasks = useLongTask<ShellLongTaskRow>({ unit, workspace, enabled });
  const [loginStop, setLoginStop] = useState<null | (() => void)>(null);
  useEffect(
    () => () => {
      loginStop?.();
    },
    [loginStop],
  );
  const openLogin = (url: string): void => {
    if (!/^https?:\/\//i.test(url)) return;
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    loginStop?.();
    const stop = watchLoginReturn({ onRetry: longTasks.refresh });
    setLoginStop(() => stop);
  };
  return { longTasks, openLogin };
}

function SchemaFrameCard(props: SchemaCardProps) {
  const title = props.t(props.view.titleKey);
  const platform = props.view.platform;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hasLongTask = props.view.customLongTask !== undefined;
  const { longTasks, openLogin } = useCardLongTasks(
    props.unit,
    props.world.current.workspace?.path ?? null,
    hasLongTask,
  );
  const longTask = hasLongTask
    ? h(SchemaLongTaskView, {
        rows: longTasks.runs,
        ...(props.view.customLongTask === undefined
          ? {}
          : { overrides: props.view.customLongTask(longTasks.runs, props.t) }),
        stopping: longTasks.stopping,
        stopFailed: longTasks.stopFailed,
        t: props.t,
        onStop: (id: string) => {
          void longTasks.stop(id);
        },
        onLogin: openLogin,
      })
    : undefined;
  const head = h(CardHead, {
    t: props.t,
    title,
    refreshing: false,
    onRefresh: props.onRefresh,
    ...(platform === undefined
      ? {}
      : { platformHref: platform.href, platform: props.t(platform.labelKey) }),
    ...(props.view.settingsGearKey === undefined
      ? {}
      : {
          gear: props.t(props.view.settingsGearKey),
          gearOpen: settingsOpen,
          onToggleGear: () => setSettingsOpen((open) => !open),
        }),
  });
  return h(
    Card,
    { t: props.t, title, refreshing: false, onRefresh: props.onRefresh, head },
    h(
      Fragment,
      null,
      props.view.customBody?.(props, {
        settingsOpen,
        onSettingsOpenChange: setSettingsOpen,
      }) ?? null,
      longTask,
    ),
  );
}

function SchemaReadCard(props: SchemaCardProps) {
  const { unit, view } = props;
  const gate = useCapabilityGate(unit, props.refreshToken);
  const readEnabled = view.read.enabled?.(props) ?? true;
  const query =
    typeof view.read.query === 'function' ? view.read.query(props) : (view.read.query ?? {});
  const feed = useCardFeed(view, query, gate.gated && readEnabled, props.refreshToken);
  const board = useUnitBoard({
    unit,
    gate,
    refreshToken: props.refreshToken,
    onRefresh: props.onRefresh,
    onSummary: props.onSummary,
    t: props.t,
    platformBlocker: (error, translate) => blockerOfError(error, translate),
    read: () => feed,
  });
  const hasLongTask = view.sections?.longTask !== undefined;
  const { longTasks, openLogin } = useCardLongTasks(
    unit,
    props.world.current.workspace?.path ?? null,
    hasLongTask,
  );

  return h(SchemaCardView, {
    ...props,
    state: board.feed.state,
    refreshing: board.feed.refreshing,
    ...(board.blocker === undefined ? {} : { blocker: board.blocker }),
    ...(hasLongTask
      ? {
          longTasks: longTasks.runs,
          longTaskStopping: longTasks.stopping,
          longTaskStopFailed: longTasks.stopFailed,
          onLongTaskStop: (id: string) => {
            void longTasks.stop(id);
          },
          onLongTaskLogin: openLogin,
        }
      : {}),
  });
}
