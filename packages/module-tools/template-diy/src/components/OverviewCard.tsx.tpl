import { createElement as h } from 'react';
import { kit } from '@dsh-workbench/core/client';
import { LIST_LIMIT, formatBytes, overviewStateOf, type OverviewReady, type OverviewState } from '../model/overview';
import styles from './OverviewCard.module.css';

const UNIT_ID = '__UNIT__';
const OVERVIEW_ROUTE = `${UNIT_ID}/overview`;

const { Card, CenteredState, EmptyState, IconPanelScreen, Row, Rows, StateBlock } = kit.components;
const { useApiResource } = kit.hooks;

type Rendered = ReturnType<typeof h>;
type Translate = (key: string, params?: Record<string, unknown>) => string;

export interface OverviewCardProps {
  readonly path: string;
  readonly refreshToken: number;
  readonly onRefresh: () => void;
  readonly t: Translate;
}

function bodyOf(state: OverviewState, t: Translate): Rendered {
  if (state.kind === 'idle') {
    return h(CenteredState, { icon: null, title: t(`${UNIT_ID}.needProject`), compact: true });
  }
  if (state.kind === 'loading') {
    return h(CenteredState, {
      icon: null,
      title: t(`${UNIT_ID}.loading`),
      hint: t(`${UNIT_ID}.loadingHint`),
      compact: true,
    });
  }
  if (state.kind === 'error') {
    return h(CenteredState, {
      icon: null,
      title: t(`${UNIT_ID}.errorTitle`),
      detail: state.detail,
      hint: t(`${UNIT_ID}.errorHint`),
      compact: true,
    });
  }
  if (state.kind === 'empty') {
    return h(EmptyState, { text: t(`${UNIT_ID}.empty`), icon: h(IconPanelScreen, { size: 20 }), compact: true });
  }
  const payload = state.payload;
  return h(
    StateBlock,
    {
      title: payload.path,
      hint:
        `${String(payload.files)}${t(`${UNIT_ID}.fileUnit`)} · ` +
        `${String(payload.dirs)}${t(`${UNIT_ID}.dirUnit`)} · ${formatBytes(payload.bytes)}`,
      resolving: t(`${UNIT_ID}.largest`),
    },
    h(
      'div',
      { className: styles.largest },
      h(
        Rows,
        null,
        ...payload.largest.map((file) =>
          h(Row, {
            key: file.name,
            label: file.name,
            value: `${formatBytes(file.bytes)} · ${file.mtime}`,
          }),
        ),
      ),
    ),
  );
}

export function OverviewCard(props: OverviewCardProps): Rendered {
  const resource = useApiResource<OverviewReady>(
    OVERVIEW_ROUTE,
    { path: props.path === '' ? undefined : props.path, limit: LIST_LIMIT },
    props.refreshToken,
    { enabled: props.path !== '' },
  );
  const state = overviewStateOf({ phase: resource.phase, value: resource.value, error: resource.error });
  return h(
    Card,
    {
      t: props.t,
      title: props.t(`${UNIT_ID}.cardTitle`),
      refreshing: resource.phase === 'loading',
      onRefresh: props.onRefresh,
    },
    bodyOf(state, props.t),
  );
}
