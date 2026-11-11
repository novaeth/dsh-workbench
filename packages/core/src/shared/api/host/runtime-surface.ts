import type { DshHostContext } from '@dsh-workbench/shared';
import type { AdapterSet, RuntimeCommandSurface } from '@dsh-workbench/shared/host';
import { WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';

export function surfaceOf(ctx: DshHostContext): RuntimeCommandSurface | undefined {
  const adapters = ctx.get(WORKBENCH_ADAPTERS, false) as AdapterSet | undefined;
  return adapters?.runtime.commandSurface?.(ctx);
}
