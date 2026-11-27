import { createElement as h, type ReactNode } from 'react';
import type { CardViewTone } from '@dsh-workbench/shared';
import { ProgressBar, StateBlock } from '@dsh-workbench/shared';
import styles from './SchemaMetric.module.css';

export interface SchemaMetricProps {
  readonly label: ReactNode;
  readonly value: string;
  readonly percent: number;
  readonly tone?: CardViewTone | undefined;
  readonly actions?: ReactNode | undefined;
}

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
      h(ProgressBar, { progress: { done: width, total: 100 }, size: 6, tone: tone ?? 'neutral' }),
      h('span', { className: styles.metricPercent }, `${String(width)}%`),
    ),
  );
}
