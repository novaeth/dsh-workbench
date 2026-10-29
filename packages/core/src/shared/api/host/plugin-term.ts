import type { DshHostContext } from '@dsh-workbench/shared';
import type { AdapterSet } from '@dsh-workbench/shared/host';
import { WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';

const NEUTRAL_PLUGIN = '插件';

export function pluginTermOf(ctx: DshHostContext): string {
  const adapters = ctx.get<AdapterSet>(WORKBENCH_ADAPTERS, false);
  return adapters?.runtime.profile?.(ctx)?.terms.plugin.zh ?? NEUTRAL_PLUGIN;
}
