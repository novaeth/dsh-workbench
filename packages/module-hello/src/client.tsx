import { createElement as h } from 'react';
import { kit } from '@dsh-workbench/core/client';
import { helloMessages } from './messages';

const UNIT_ID = 'hello';

type Rendered = ReturnType<typeof h>;
type Translate = (key: string, params?: Record<string, unknown>) => string;

interface UnitClientFace {
  readonly unit: string;
  readonly messages: { readonly zh: Readonly<Record<string, string>>; readonly en: Readonly<Record<string, string>> };
  readonly card: (props: { readonly t: Translate; readonly onRefresh: () => void }) => Rendered;
}

interface UnitClientApi {
  registerUnit(face: UnitClientFace): () => void;
}

interface ClientContext {
  get<T = unknown>(name: string): T | undefined;
  effect(effect: () => void | (() => void), label?: string): () => void;
}

const helloClient: UnitClientFace = {
  unit: UNIT_ID,
  messages: helloMessages,
  card: (props) => {
    const { Card, IconBrandMark } = kit.components;
    return h(
      Card,
      {
        t: props.t,
        title: props.t('hello.cardTitle'),
        refreshing: false,
        onRefresh: props.onRefresh,
      },
      h('p', null, h(IconBrandMark, { size: 16 }), ' ', props.t('hello.heading')),
      h('p', null, props.t('hello.body')),
    );
  },
};

export const inject = ['workbenchUnits'];

export function apply(ctx: ClientContext): void {
  const units = ctx.get<UnitClientApi>('workbenchUnits');
  if (units === undefined) {
    console.warn(`[${UNIT_ID}] 外壳没有提供 workbenchUnits 服务：这张卡片装不进来`);
    return;
  }
  ctx.effect(() => units.registerUnit(helloClient), `module-hello: 注册 ${UNIT_ID}`);
}
