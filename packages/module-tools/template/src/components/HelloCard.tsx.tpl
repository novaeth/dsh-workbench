import { createElement as h } from 'react';
import { kit } from '@dsh-workbench/core/client';

const UNIT_ID = '__UNIT__';

const { Card } = kit.components;

type Rendered = ReturnType<typeof h>;
type Translate = (key: string, params?: Record<string, unknown>) => string;

export interface HelloCardProps {
  readonly t: Translate;
  readonly onRefresh: () => void;
}

export function HelloCard(props: HelloCardProps): Rendered {
  return h(
    Card,
    {
      t: props.t,
      title: props.t(`${UNIT_ID}.cardTitle`),
      refreshing: false,
      onRefresh: props.onRefresh,
    },
    h('p', null, props.t(`${UNIT_ID}.heading`)),
    h('p', null, props.t(`${UNIT_ID}.body`)),
  );
}
