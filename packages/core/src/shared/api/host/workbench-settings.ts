import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DshHostContext } from '@dsh-workbench/shared';
import type { PostResource, RouteTable } from '@dsh-workbench/shared/host';
import { writeJsonFile } from '@dsh-workbench/shared/host';
import type {
  WorkbenchSettings,
  WorkbenchSettingsApplied,
  WorkbenchSettingsRequest,
} from '@/kernel/contract/workbench-settings';
import { WORKBENCH_SETTINGS_RESOURCE, WORKBENCH_SETTINGS_ROUTE } from '@/kernel/contract/workbench-settings';

export { WORKBENCH_SETTINGS_ROUTE } from '@/kernel/contract/workbench-settings';

export const WORKBENCH_SETTINGS_SERVICE = 'workbenchSettingsStore';

export const DEFAULT_WORKBENCH_SETTINGS: WorkbenchSettings = { mcpOnDemand: false, includePrerelease: false };

export interface WorkbenchSettingsStore {
  read(): WorkbenchSettings;
  apply(payload: unknown): WorkbenchSettingsApplied;
  watch(listener: (settings: WorkbenchSettings) => void): () => void;
}

function booleanOf(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function settingsOf(raw: unknown): WorkbenchSettings {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    mcpOnDemand: booleanOf(record['mcpOnDemand']) ?? DEFAULT_WORKBENCH_SETTINGS.mcpOnDemand,
    includePrerelease:
      booleanOf(record['includePrerelease']) ?? DEFAULT_WORKBENCH_SETTINGS.includePrerelease,
  };
}

export function createWorkbenchSettingsStore(options: { readonly root: string }): WorkbenchSettingsStore {
  const file = join(options.root, 'settings.json');
  const listeners = new Set<(settings: WorkbenchSettings) => void>();
  let cached: WorkbenchSettings | undefined;

  const read = (): WorkbenchSettings => {
    if (cached !== undefined) return cached;
    try {
      cached = settingsOf(JSON.parse(readFileSync(file, 'utf8')) as unknown);
    } catch {
      cached = DEFAULT_WORKBENCH_SETTINGS;
    }
    return cached;
  };

  return {
    read,
    apply(payload) {
      const request = (typeof payload === 'object' && payload !== null ? payload : {}) as WorkbenchSettingsRequest;
      const next: WorkbenchSettings = {
        mcpOnDemand: booleanOf(request.mcpOnDemand) ?? read().mcpOnDemand,
        includePrerelease: booleanOf(request.includePrerelease) ?? read().includePrerelease,
      };
      if (request.mcpOnDemand !== undefined && booleanOf(request.mcpOnDemand) === undefined) {
        throw new Error('mcpOnDemand 要是 true / false');
      }
      if (request.includePrerelease !== undefined && booleanOf(request.includePrerelease) === undefined) {
        throw new Error('includePrerelease 要是 true / false');
      }
      const changed =
        next.mcpOnDemand !== read().mcpOnDemand ||
        next.includePrerelease !== read().includePrerelease;
      if (changed) writeJsonFile(file, next);
      cached = next;
      if (changed) for (const listener of [...listeners]) listener(next);
      return { ok: true, settings: next };
    },
    watch(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function mountWorkbenchSettings(options: {
  readonly ctx: DshHostContext;
  readonly routes: RouteTable;
  readonly root: string;
}): WorkbenchSettingsStore {
  const store = createWorkbenchSettingsStore({ root: options.root });
  options.ctx.provide(WORKBENCH_SETTINGS_SERVICE, store);
  options.routes[WORKBENCH_SETTINGS_ROUTE] = () => ({ ok: true, settings: store.read() });
  return store;
}

export function workbenchSettingsAction(store: WorkbenchSettingsStore): PostResource {
  return {
    resource: WORKBENCH_SETTINGS_RESOURCE,
    handle: (payload: unknown) => store.apply(payload),
  };
}
