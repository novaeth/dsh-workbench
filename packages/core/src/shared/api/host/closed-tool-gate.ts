import type { DshHostContext } from '@dsh-workbench/shared';
import type { UnitMountResult } from '@dsh-workbench/shared/host';
import { presetOfSession } from './preset-scope';
import { toolScopeContextOf } from './tool-scope';

export function createClosedReasonOf(options: {
  readonly ctx: DshHostContext;
  readonly gates: () => Iterable<UnitMountResult['gate'] | undefined>;
}): (name: string, agent: unknown) => string | undefined {
  return (name, agent) => {
    const context = toolScopeContextOf(agent, (handle) => presetOfSession(options.ctx, handle));
    if (context === null) return undefined;
    for (const gate of options.gates()) {
      const reason = gate?.denyReason?.(name, context);
      if (reason !== undefined) return reason;
    }
    return undefined;
  };
}
