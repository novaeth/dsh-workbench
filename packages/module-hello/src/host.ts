import type { HostContext, UnitModuleFace, UnitRegistry } from '@dsh-workbench/core/contract';

const PLUGIN_ID = '@dsh-workbench/module-hello';

const UNIT_ID = 'hello';

const helloHost: UnitModuleFace = {
  unit: UNIT_ID,
  mount: () => ({ routes: {}, registerTools: () => [] }),
};

export const name = PLUGIN_ID;

export const inject = ['workbenchUnits'];

export function apply(ctx: HostContext): void {
  const units = ctx.get<UnitRegistry>('workbenchUnits');
  if (units === undefined) {
    ctx.logger?.warn?.(`[${UNIT_ID}] 外壳没有提供 workbenchUnits 服务：这个模块装不进来`);
    return;
  }
  ctx.effect(() => units.register(helloHost), `module-hello: 注册 ${UNIT_ID}`);
}
