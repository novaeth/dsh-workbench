import type { ClientContext, UnitClientApi, UnitClientFace } from '@dsh-workbench/core/contract';
import { OverviewCard } from './components/OverviewCard';
import { messages } from './messages';

const UNIT_ID = '__UNIT__';

const face: UnitClientFace = {
  unit: UNIT_ID,
  messages,
  card: (props) =>
    OverviewCard({
      path: props.world.current.workspace?.path ?? '',
      refreshToken: props.refreshToken,
      onRefresh: props.onRefresh,
      t: props.t,
    }),
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
