import type { DshHostContext } from '@dsh-workbench/shared';
import type { PostResource, PostWrite } from '@dsh-workbench/shared/host';
import {
  ACTIONS_PREFIX,
  PREFS_PREFIX,
  PROVISION_PREFIX,
  registerActions,
  registerPrefs,
  registerProvision,
} from '@dsh-workbench/shared/host';
import { failureReasonOf, type UnitsPlan } from '@/kernel/host/mount-units.js';

export interface PostChannelDeps {
  readonly ctx: DshHostContext;
  readonly mounted: ReadonlyMap<string, { readonly plan: UnitsPlan }>;
  readonly facts: { bump(names: readonly string[]): unknown };
  readonly shellActions: readonly PostResource[];
}

export interface PostChannels {
  rebind(wrote: (resource: string, write: PostWrite) => void): void;
  dispose(): void;
}

export function createPostChannels(deps: PostChannelDeps): PostChannels {
  const { ctx, mounted, facts, shellActions } = deps;
  let undo: Array<(() => void) | undefined> = [];
  const bind = (prefix: string, register: () => () => void): void => {
    try {
      undo.push(register());
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-workbench] ${prefix} 这条写通道没接上：${failureReasonOf(error)}`);
    }
  };
  return {
    rebind(wrote) {
      for (const dispose of undo.reverse()) dispose?.();
      undo = [];
      const prefs = [...mounted.values()].flatMap((item) => item.plan.prefs);
      const actions = [...shellActions, ...[...mounted.values()].flatMap((item) => item.plan.actions)];
      const provision = [...mounted.values()].find((item) => item.plan.provision !== undefined)?.plan.provision;
      if (prefs.length > 0) bind(PREFS_PREFIX, () => registerPrefs(ctx, prefs, wrote));
      if (actions.length > 0) bind(ACTIONS_PREFIX, () => registerActions(ctx, actions, wrote));
      if (provision !== undefined) bind(PROVISION_PREFIX, () => registerProvision(ctx, provision, facts));
    },
    dispose() {
      for (const dispose of undo) dispose?.();
      undo = [];
    },
  };
}
