import type { HostContext, UnitModuleFace, UnitRegistry } from '@dsh-workbench/core/contract';

const UNIT_ID = '__UNIT__';

export const name = '__NAME__';

export const inject = ['workbenchUnits'];

const face: UnitModuleFace = {
  unit: UNIT_ID,
  mount: () => ({ routes: {}, registerTools: () => [] }),
};

export function apply(ctx: HostContext): void {
  const units = ctx.get<UnitRegistry>('workbenchUnits');
  if (units === undefined) {
    ctx.logger?.warn?.(`[${UNIT_ID}] 外壳没有提供 workbenchUnits 服务：这个模块装不进来`);
    return;
  }
  ctx.effect(() => units.register(face), `__NAME__: 注册 ${UNIT_ID}`);
}
