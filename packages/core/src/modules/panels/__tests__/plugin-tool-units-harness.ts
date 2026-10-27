import type { DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared';
import { toolUnits, type ToolScopeContext, type WorkspaceStore } from '@dsh-workbench/shared/host';
import { createFakeShell, createNoopDataReader,
} from '@dsh-workbench/shared/testing';
import { createFakeOpencli } from './fake-opencli';
import { createPluginCatalog } from '@dsh-workbench/adapters-default';
import { createPluginUnits } from '@dsh-workbench/adapters-default';
import { mountUnits } from '@/kernel/host/mount-units';
import { createUnitRegistry, type UnitRegistry } from '@/kernel/host/unit-registry';
import type { PluginLedger } from '../model/plugin-ledger';
import { pluginPanelRefs } from '../model/plugin-panel';
import { createPanelsService, type PanelsService } from '../model/service';
import { panelsHost } from '../index';
import { DIY_DEBUG_TOOLS, DIY_RECORD_TOOLS, DIY_TOOLS } from '../unit';

export const COMMANDS = [
  {
    site: 'inventory',
    name: 'builds',
    description: '构建列表',
    access: 'read',
    browser: true,
    siteSession: 'persistent',
    domain: 'inventory.example.cn',
    args: [{ name: 'job', type: 'string', required: false, help: '构建配置 ID' }],
  },
  {
    site: 'inventory',
    name: 'build',
    description: 'Inventory 一键构建',
    access: 'write',
    browser: true,
    args: [{ name: 'enterprise', type: 'string', required: true, help: '企业 ID' }],
  },
  {
    site: 'deploy',
    name: 'applications',
    description: '应用列表',
    access: 'read',
    browser: false,
    args: [],
  },
];

export interface Harness {
  readonly registry: UnitRegistry;
  readonly panels: PanelsService;
  readonly tools: Map<string, DshToolDefinition>;
  readonly gate: { deniedTools(context: ToolScopeContext): readonly string[] };
  readonly manager: ReturnType<typeof createPluginUnits>;
  readonly problems: string[];
  readonly definitions: () => DshToolDefinition[];
  readonly commands: () => readonly string[];
  readonly opencliCalls: () => readonly {
    readonly args: readonly string[];
    readonly workdir?: string;
    readonly session?: string;
  }[];
  readonly toolOf: (name: string) => DshToolDefinition | undefined;
  readonly ownerOf: (name: string) => { readonly needsApproval?: unknown; readonly manifest: unknown } | undefined;
  readonly units: () => readonly string[];
  readonly declaredNotes: () => ReadonlySet<string>;
}

export function deny(h: Harness, workspace: string, preset: string | null = null): string[] {
  const workshop = new Set<string>([...DIY_TOOLS, ...DIY_DEBUG_TOOLS, ...DIY_RECORD_TOOLS]);
  return [...h.gate.deniedTools({ workspace, preset })].filter((name) => !workshop.has(name));
}

export function harnessOf(options: {
  readonly store: WorkspaceStore;
  readonly ledger: PluginLedger;
  readonly pluginRows: () => unknown;
  readonly commands?: unknown;
  readonly declared?: ReadonlyMap<string, ReadonlySet<string>>;
  readonly moduleTools?: readonly string[];
  readonly opencliReplies?: readonly unknown[];
  readonly failTools?: readonly string[];
}): Harness {
  const live = new Map<string, DshToolDefinition>();
  const failTools = new Set(options.failTools ?? []);
  const toolsRegistry: DshToolRegistry = {
    register(definition) {
      if (failTools.has(definition.name)) throw new Error(`模拟 dsh 拒了 ${definition.name}`);
      live.set(definition.name, definition);
      return () => {
        live.delete(definition.name);
      };
    },
  };
  const problems: string[] = [];
  const ctx = {
    get: (key: string) => (key === 'tools' ? toolsRegistry : undefined),
    provide: () => () => {},
    logger: { info: () => {}, warn: (message: string) => problems.push(message) },
  };
  const registry = createUnitRegistry({ declarationOf: () => undefined });
  const panels = createPanelsService({
    manifests: () => registry.manifests(),
    store: options.store,
    owned: () => [],
    plugins: () => pluginPanelRefs(options.ledger),
  });
  const faces = new Map<
    string,
    {
      readonly result: ReturnType<typeof mountUnits>['mounted'][number]['result'];
      readonly disposers: readonly (() => void)[];
      readonly declaredNotes: ReadonlySet<string>;
    }
  >();

  function sync(): void {
    const present = new Set(registry.all().map((host) => host.unit));
    for (const [id, item] of [...faces]) {
      if (present.has(id)) continue;
      for (const off of item.disposers) off();
      faces.delete(id);
    }
    for (const host of registry.all()) {
      if (faces.has(host.unit)) continue;
      const plan = mountUnits([host], {
        ctx: ctx as never,
        manifests: () => registry.manifests(),
        ownedUnits: () => [],
        store: options.store,
      });
      for (const item of plan.mounted) {
        faces.set(item.host.unit, {
          result: item.result,
          disposers: item.result.registerTools(),
          declaredNotes: plan.declaredNotes,
        });
      }
    }
  }
  registry.subscribe(sync);

  const fake = createFakeShell((call) =>
    call.command.endsWith('plugin list -f json')
      ? { stdout: JSON.stringify(options.pluginRows()) }
      : { stdout: JSON.stringify(options.commands ?? COMMANDS) },
  );
  const catalog = createPluginCatalog({ shell: fake.shell, command: 'opencli' });
  const opencli = createFakeOpencli([...(options.opencliReplies ?? [{ ok: true }])]);
  const moduleTools = new Set(options.moduleTools ?? []);

  const manager = createPluginUnits({
    registry,
    catalog,
    rows: () => panels.listPlugins(null),
    declared: (plugin) => options.declared?.get(plugin) ?? new Set<string>(),
    opencliFor: () => opencli.opencli,
    toolNames: () => moduleTools,
    logger: { info: () => {}, warn: (message: string) => problems.push(message) },
  });

  const mounted = panelsHost.mount({
    manifest: panelsHost.manifest,
    ctx: ctx as never,
    manifests: () => registry.manifests(),
    ownedUnits: () => [],
    store: options.store,
    data: createNoopDataReader(),
  });

  return {
    registry,
    panels,
    tools: live,
    commands: () => fake.commands(),
    opencliCalls: () => opencli.calls,
    gate: mounted.gate as { deniedTools(context: ToolScopeContext): readonly string[] },
    manager,
    problems,
    definitions: () => [...live.values()],
    toolOf: (name) => live.get(name),
    ownerOf: (name) => {
      const unit = toolUnits(registry.manifests()).get(name)?.unit;
      const face = unit === undefined ? undefined : faces.get(unit);
      const manifest = registry.manifests().find((item) => item.id === unit);
      return face === undefined || manifest === undefined
        ? undefined
        : { needsApproval: face.result.needsApproval, manifest };
    },
    units: () => registry.all().map((host) => host.unit),
    declaredNotes: () => new Set([...faces.values()].flatMap((item) => [...item.declaredNotes])),
  };
}
