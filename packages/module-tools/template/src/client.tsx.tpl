import type { ReactElement } from 'react';
import { HelloCard } from './components/HelloCard';
import { messages } from './messages';

const UNIT_ID = '__UNIT__';

type Translate = (key: string, params?: Record<string, unknown>) => string;

interface UnitClientFace {
  readonly unit: string;
  readonly messages: { readonly zh: Readonly<Record<string, string>>; readonly en: Readonly<Record<string, string>> };
  readonly card: (props: { readonly t: Translate; readonly onRefresh: () => void }) => ReactElement;
}

interface UnitClientApi {
  registerUnit(face: UnitClientFace): () => void;
}

interface ClientContext {
  get<T = unknown>(name: string): T | undefined;
  effect(effect: () => void | (() => void), label?: string): () => void;
}

const face: UnitClientFace = {
  unit: UNIT_ID,
  messages,
  card: (props) => HelloCard({ t: props.t, onRefresh: props.onRefresh }),
};

export const inject = ['workbenchUnits'];

export function apply(ctx: ClientContext): void {
  const units = ctx.get<UnitClientApi>('workbenchUnits');
  if (units === undefined) {
    console.warn(`[${UNIT_ID}] 外壳没有提供 workbenchUnits 服务：这张卡片装不进来`);
    return;
  }
  ctx.effect(() => units.registerUnit(face), `__NAME__: 注册 ${UNIT_ID}`);
}
