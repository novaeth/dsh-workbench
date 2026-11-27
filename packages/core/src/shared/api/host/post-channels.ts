import type { DshHostContext } from '@dsh-workbench/shared/host';
import { workbenchRoot } from '@dsh-workbench/shared/host';
import type { DiagRecorder, PostResource, PostWrite } from '@dsh-workbench/shared/host';
import { withDiagProvision } from './diag-provision.js';
import { diagHostOf, diagRoutesOf } from './diag-routes.js';
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
  readonly diag?: DiagRecorder | undefined;
}

export interface PostChannels {
  rebind(wrote: (resource: string, write: PostWrite) => void): void;
  dispose(): void;
}

export function createPostChannels(deps: PostChannelDeps): PostChannels {
  const { ctx, mounted, facts, shellActions, diag } = deps;
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
      if (prefs.length > 0) bind(PREFS_PREFIX, () => registerPrefs(ctx, prefs, wrote, diag));
      if (actions.length > 0) bind(ACTIONS_PREFIX, () => registerActions(ctx, actions, wrote, diag));
      if (provision !== undefined) bind(PROVISION_PREFIX, () => registerProvision(ctx, withDiagProvision(provision, diagRoutesOf(workbenchRoot(), diagHostOf(ctx)).recorder), facts));
    },
    dispose() {
      for (const dispose of undo) dispose?.();
      undo = [];
    },
  };
}
