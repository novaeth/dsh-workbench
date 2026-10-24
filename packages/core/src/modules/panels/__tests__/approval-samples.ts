import type { LongTaskBase } from '@dsh-workbench/shared/host';
import { createLongTaskRegistry } from '@dsh-workbench/shared/host';
import type { LongTaskRunsLookup } from '../model/long-task-tools';
import {
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_RESUME_TOOL,
  DIY_DEBUG_START_TOOL,
  DIY_DEBUG_STOP_TOOL,
  DIY_INSTALL_TOOL,
  DIY_PUBLISH_TOOL,
  DIY_RECORD_PREPARE_TOOL,
  DIY_SHOW_TOOL,
  DIY_TOOLS,
  LONG_TASKS_STOP_TOOL,
  MODULES_INSTALL_BUNDLE_TOOL,
  MODULES_INSTALL_TOOL,
  MODULES_UNINSTALL_PLUGIN_TOOL,
  MODULES_UNINSTALL_TOOL,
  MODULES_UPDATE_DEPENDENCY_TOOL,
  MODULES_UPDATE_PLUGIN_TOOL,
  MODULES_UPDATE_TOOL,
  MODULES_UPDATE_WORKBENCH_TOOL,
  PANELS_FOLLOW_TOOL,
  PANELS_HIDE_TOOL,
  PANELS_MOVE_TOOL,
  PANELS_RESET_TOOL,
  PANELS_SHOW_TOOL,
  WRITE_TOOLS,
  panelsUnit,
} from '../unit';

export const writers = panelsUnit.tools.filter((tool) => tool.writes);

export const WRITE_CALLS: Readonly<Record<string, unknown>> = {
  [PANELS_SHOW_TOOL]: { id: 'issues' },
  [PANELS_HIDE_TOOL]: { id: 'issues' },
  [PANELS_MOVE_TOOL]: { id: 'issues', index: 0 },
  [PANELS_RESET_TOOL]: {},
  [PANELS_FOLLOW_TOOL]: { id: 'issues' },
  [MODULES_INSTALL_TOOL]: { id: 'inventory' },
  [MODULES_UPDATE_TOOL]: { id: 'inventory' },
  [MODULES_UNINSTALL_TOOL]: { id: 'inventory' },
  [MODULES_INSTALL_BUNDLE_TOOL]: { spec: '@scope/mod@1.2.3' },
  [MODULES_UPDATE_DEPENDENCY_TOOL]: { id: 'plugin:demo' },
  [MODULES_UPDATE_PLUGIN_TOOL]: { plugin: 'inventory' },
  [MODULES_UNINSTALL_PLUGIN_TOOL]: { plugin: 'inventory' },
  [MODULES_UPDATE_WORKBENCH_TOOL]: {},
  [DIY_RECORD_PREPARE_TOOL]: { unit: 'demo', url: 'https://inventory.example.com/env', doing: '发布' },
  [DIY_INSTALL_TOOL]: { unit: 'demo' },
  [DIY_PUBLISH_TOOL]: { unit: 'demo', target: 'team', version: 'patch' },
  [DIY_SHOW_TOOL]: { unit: 'demo' },
  [DIY_DEBUG_START_TOOL]: { unit: 'demo' },
  [DIY_DEBUG_PAUSE_TOOL]: {},
  [DIY_DEBUG_RESUME_TOOL]: {},
  [DIY_DEBUG_STOP_TOOL]: {},
  [LONG_TASKS_STOP_TOOL]: { unit: 'inventory', id: 'run-1' },
};

export function stopRuns(
  options: { readonly session?: string | undefined; readonly target?: string | undefined } = {},
): LongTaskRunsLookup {
  const registry = createLongTaskRegistry<LongTaskBase>({
    run: () => new Promise(() => {}),
    view: (snapshot) => ({ target: snapshot.target, status: snapshot.status, step: snapshot.step }),
    nextId: () => 'run-1',
    now: () => '2026-10-21T00:00:00.000Z',
  });
  registry.start({
    workspace: '/w/x',
    target: options.target ?? 'env-prod',
    ...(options.session === undefined ? {} : { session: options.session }),
  });
  return () => new Map([['inventory', registry]]);
}

export const ALLOWED_WRITES = new Set<string>([
  ...DIY_TOOLS.filter((one) => one !== DIY_PUBLISH_TOOL),
  DIY_DEBUG_PAUSE_TOOL,
  DIY_DEBUG_STOP_TOOL,
]);

export const ASK_TOOLS = WRITE_TOOLS.filter((name) => !ALLOWED_WRITES.has(name));
