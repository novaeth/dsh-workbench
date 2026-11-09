import { createElement as h, type ReactNode } from 'react';
import type { CardViewTone } from '@dsh-workbench/shared';
import { StateBlock } from '@dsh-workbench/shared';
import styles from './SchemaMetric.module.css';

export interface SchemaMetricProps {
  readonly label: ReactNode;
  readonly value: string;
  readonly percent: number;
  readonly tone?: CardViewTone | undefined;
  readonly actions?: ReactNode | undefined;
}

const FILL: Record<CardViewTone, string> = {
  neutral: styles.metricFillNeutral,
  ok: styles.metricFillOk,
  warn: styles.metricFillWarn,
  bad: styles.metricFillBad,
  busy: styles.metricFillBusy,
};

export function SchemaMetric({ label, value, percent, tone, actions }: SchemaMetricProps) {
  const width = Math.min(100, Math.max(0, percent));
  return h(
    StateBlock,
    {
      title: label,
      hint: value,
      ...(actions === undefined ? {} : { actions }),
    },
    h(
      'div',
      { className: styles.metricBarRow },
      h(
        'div',
        {
          className: styles.metricTrack,
          role: 'progressbar',
          'aria-valuenow': width,
          'aria-valuemin': 0,
          'aria-valuemax': 100,
        },
        h('div', {
          className: `${styles.metricFill} ${FILL[tone ?? 'neutral']}`,
          style: { width: `${String(width)}%` },
        }),
      ),
      h('span', { className: styles.metricPercent }, `${String(width)}%`),
    ),
  );
}
