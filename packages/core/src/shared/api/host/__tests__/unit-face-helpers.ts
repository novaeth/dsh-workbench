import type { UnitManifest } from '@dsh-workbench/shared';
import type { UnitMountDeps, UnitMountResult, ToolScopeContext } from '@dsh-workbench/shared/host';
import { unitTitleKey } from '@dsh-workbench/shared/host';
import type { HostUnit } from '@/kernel/host/unit-registry';

export function manifest(id: string, host: { inject: string[]; optional?: string[] }): UnitManifest {
  return { id, titleKey: unitTitleKey(id), card: null, tools: [], host };
}

export function hostOf(unit: UnitManifest, mount: (deps: UnitMountDeps) => UnitMountResult): HostUnit {
  return { unit: unit.id, manifest: unit, source: { kind: 'package', pkg: 'test' }, face: { unit: unit.id, mount } };
}

export function face(
  unit: UnitManifest,
  options: {
    routes?: string[];
    gate?: { deniedTools(context: ToolScopeContext): readonly string[]; subscribe(listener: () => void): () => void };
    prefs?: string;
    context?: string[];
    provision?: boolean;
  } = {},
): HostUnit {
  return hostOf(unit, () => {
    return {
        routes: Object.fromEntries((options.routes ?? []).map((key) => [key, () => ({ ok: true })])),
        registerTools: () => [],
        ...(options.gate === undefined ? {} : { gate: { ...options.gate, subscribe: () => () => {} } }),
        ...(options.prefs === undefined ? {} : { prefs: { resource: options.prefs, handle: () => ({ ok: true }) } }),
        ...(options.context === undefined
          ? {}
          : { context: { kinds: options.context, render: () => '正文' } }),
        ...(options.provision === true ? { provision: { handle: () => ({ ok: true }) } } : {}),
    };
  });
}

export const ctxWith = (available: string[]) =>
  ({ get: (name: string) => (available.includes(name) ? {} : undefined) }) as never;
