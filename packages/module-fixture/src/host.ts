import type { HostContext, UnitRegistry } from '@dsh-workbench/core/contract';

export const name = '@dsh-workbench/module-fixture';

export const inject = ['workbenchUnits'];

function registryOf(ctx: HostContext): UnitRegistry | undefined {
  return (ctx.get as (name: string) => UnitRegistry | undefined)('workbenchUnits');
}

export function apply(ctx: HostContext): void {
  const units = registryOf(ctx);
  if (units === undefined) {
    ctx.logger?.warn?.('[fixture] 外壳没有提供 workbenchUnits 服务');
    return;
  }
  ctx.effect(
    () => units.register({ unit: 'fixture', mount: () => ({ routes: {}, registerTools: () => [] }) }),
    'module-fixture: 注册 fixture',
  );
}
