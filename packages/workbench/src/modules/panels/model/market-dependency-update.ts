import type { UnitCapability } from '@/shared/api/host/probe-units';
import {
  dependencyCommandPlan,
  type DependencyTarget,
  type SharedDependency,
} from './market-dependency';
import { dependencyStillBehind } from './market-verify';

export interface DependencyUpdateDeps {
  readonly command: string;
  readonly capabilityOf: (unit: string, force?: boolean) => Promise<UnitCapability>;
  readonly runAll: (commands: readonly { readonly line: string; readonly optional?: true }[]) => Promise<void>;
  readonly snapshot: () => Promise<readonly SharedDependency[]>;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}

export async function updateDependencyRow(
  target: DependencyTarget,
  deps: DependencyUpdateDeps,
): Promise<readonly SharedDependency[]> {
  const seen = new Map<string, UnitCapability>();
  for (const manifest of target.declarers) seen.set(manifest.id, await deps.capabilityOf(manifest.id, true));
  const primary = target.declarers[0];
  const before = primary === undefined ? undefined : seen.get(primary.id);
  const commands = dependencyCommandPlan({
    target,
    capability: before,
    capabilities: seen,
    command: deps.command,
  });
  if (commands === undefined) {
    const behind = dependencyStillBehind(target, seen);
    if (behind !== undefined) throw new Error(`这一行没有可执行的更新命令：${behind}`);
    return deps.snapshot();
  }
  await deps.runAll(commands);
  const after = new Map<string, UnitCapability>();
  for (const manifest of target.declarers)
    after.set(manifest.id, await deps.capabilityOf(manifest.id, true));
  const behind = dependencyStillBehind(target, after);
  if (behind !== undefined) throw new Error(`更新命令跑完了，但还差一步：${behind}`);
  deps.logger?.info?.(`[dsh-workbench] 已更新依赖 ${target.id}`);
  return deps.snapshot();
}
