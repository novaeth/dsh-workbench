import { createElement as h } from 'react';
import { kit } from '@dsh-workbench/core/client';
import { formatBytes, type OverviewState } from '../model/overview';
import styles from './OverviewBody.module.css';

const { CenteredState, EmptyState, IconPanelScreen, Row, Rows, StateBlock } = kit.components;
const UNIT_ID = '__UNIT__';

export interface OverviewBodyProps {
  readonly state: OverviewState;
  readonly t: (key: string) => string;
}

export function OverviewBody({ state, t }: OverviewBodyProps): ReturnType<typeof h> {
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
