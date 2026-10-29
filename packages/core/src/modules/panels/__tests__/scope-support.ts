import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import type { UnitManifest, UnitTool } from '@dsh-workbench/shared';
import { unitTitleKey } from '@dsh-workbench/shared';
import { createNoopDataReader,
} from '@dsh-workbench/shared/testing';
import { createHostKit, createWorkspaceStore, type WorkspaceStore } from '@dsh-workbench/shared/host';
import type { PanelEntry } from '../model/config';
import { PANELS_FILE, PANELS_MODULE_ID, createPanelsService, type PanelsService } from '../model/service';
import { registerPanelTools } from '../model/tools';
import { DIY_DEBUG_TOOLS, DIY_RECORD_TOOLS, DIY_TOOLS } from '../unit';
import { WORKBENCH_ADAPTERS } from '@dsh-workbench/shared/host';
import { testAdaptersWith } from './test-adapters';
import { panelsHost } from '../index';

const testAdapters = testAdaptersWith({ root: () => process.cwd(), profile: () => process.cwd() });

export const A = '/w/a';
export const B = '/w/b';
export const MACHINE_BOARD = ['machine-card'];
export const WORKSPACE_BOARD = ['boarded'];

export function tool(name: string): UnitTool {
  return { name, writes: false };
}

export function unit(id: string, order: number, tools: readonly UnitTool[] = [], card = true): UnitManifest {
  return {
    id,
    titleKey: unitTitleKey(id),
    card: card ? { order } : null,
    tools,
    host: { inject: [] },
  };
}

export const MACHINE_UNIT = unit('machine-card', 5, [tool('machine_read'), tool('machine_list')]);
export const BOARDED_UNIT = unit('boarded', 10, [tool('boarded_read')]);
export const PROJECT_UNIT = unit('project-only', 20, [tool('project_read')]);
export const MIXED_UNIT = unit('mixed', 30, [tool('mixed_project'), tool('mixed_machine')]);

export const UNITS = [MACHINE_UNIT, BOARDED_UNIT, PROJECT_UNIT, MIXED_UNIT];

export let root = '';
export let store: WorkspaceStore;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-panels-scope-'));
  store = createWorkspaceStore({ root });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

export function mount(
  manifests: readonly UnitManifest[] = UNITS,
  owned: readonly string[] = [],
): PanelsService {
  return createPanelsService({
    manifests: () => manifests,
    store: createWorkspaceStore({ root }),
    owned: () => owned,
  });
}

export function writeBoard(workspace: string | null, shown: readonly string[]): void {
  const folder = workspace === null ? store.machine(PANELS_MODULE_ID) : store.for(PANELS_MODULE_ID, workspace);
  folder.write(PANELS_FILE, { shown });
}

export function writeBoardWith(workspace: string | null, shown: readonly string[], hidden: readonly string[]): void {
  const folder = workspace === null ? store.machine(PANELS_MODULE_ID) : store.for(PANELS_MODULE_ID, workspace);
  folder.write(PANELS_FILE, { shown, hidden });
}

export function fakeCtx() {
  return {
    get: (key: string) => (key === WORKBENCH_ADAPTERS ? testAdapters : undefined),
    provide: () => () => {},
    logger: { info: () => {}, warn: () => {} },
  };
}

export function gate(
  manifests: readonly UnitManifest[] = UNITS,
  owned: readonly string[] = [],
  ctx: unknown = fakeCtx(),
) {
  return panelsHost.mount({
    manifest: panelsHost.manifest,
    ctx: ctx as never,
    manifests: () => manifests,
    ownedUnits: () => owned,
    store: createWorkspaceStore({ root }),
    data: createNoopDataReader(),
    ...createHostKit(),
  });
}

export function denied(mounted: ReturnType<typeof gate>, workspace: string, preset: string | null = null): string[] {
  const workshop = new Set<string>([...DIY_TOOLS, ...DIY_DEBUG_TOOLS, ...DIY_RECORD_TOOLS]);
  return [...(mounted.gate?.deniedTools({ workspace, preset }) ?? [])].filter((name) => !workshop.has(name));
}

export const EXEC = { agent: { session: { header: { cwd: A } } } };

interface RanTool {
  readonly text: string;
  readonly units: PanelEntry[];
}

export function toolHarness(manifests: readonly UnitManifest[] = UNITS, owned: readonly string[] = []) {
  const registered: Array<{
    name: string;
    execute: (args: unknown, exec?: unknown) => Promise<unknown>;
  }> = [];
  const ctx = {
    get: (key: string) =>
      key === WORKBENCH_ADAPTERS ? testAdapters :
      key === WORKBENCH_ADAPTERS ? testAdapters :
      key === 'tools'
        ? {
            register(definition: { name: string; execute: (args: unknown, exec?: unknown) => Promise<unknown> }) {
              registered.push(definition);
              return () => {};
            },
          }
        : undefined,
    logger: { info: () => {}, warn: () => {} },
  };
  const panels = createPanelsService({
    manifests: () => manifests,
    store: createWorkspaceStore({ root }),
    owned: () => owned,
  });
  registerPanelTools(ctx as never, panels);
  return {
    panels,
    run: (name: string, args: Record<string, unknown>, exec: unknown = EXEC) =>
      registered.find((one) => one.name === name)?.execute(args, exec) as Promise<RanTool>,
  };
}

export function machineConfig(): string {
  return path.join(store.machine(PANELS_MODULE_ID).dir, PANELS_FILE);
}

export function workspaceConfig(workspace: string): string {
  return path.join(store.for(PANELS_MODULE_ID, workspace).dir, PANELS_FILE);
}

export function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
