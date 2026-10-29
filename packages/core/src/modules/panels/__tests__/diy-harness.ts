import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { PublishPreview } from '@dsh-workbench/shared/contract/protocol/market-index';
import { WORKBENCH_ADAPTERS, createWorkspaceStore } from '@dsh-workbench/shared/host';
import { testAdaptersWith } from './test-adapters';
import type { RuntimeCommandSurface } from '@dsh-workbench/shared/host';
import {
  DIY_DEBUG_SERVICE,
  DIY_RECORD_SERVICE,
  PANEL_STATE_SERVICE,
  UNITS_SERVICE,
  createDebugStore,
  createPanelStateStore,
  createRecordStore,
  type DebugStore,
  type PanelStateStore,
  type RecordStore,
} from '@dsh-workbench/shared/host';
import { registerDiyTools } from '../model/diy-tools';
import { registerRecordTools } from '../model/diy-record-tools';
import { stopObservers, withObserverCleanup } from '../model/diy-observers';
import type { BundleInstallOutcome } from '../model/market';
import { createPanelsService } from '../model/service';
import { panelsUnit } from '../unit';
import { fakeWorkspace, fakeWorkspaceRegistry } from './fake-workspace-registry';

export type Application = 'applied' | 'restart-required' | 'overridden' | 'cancelled' | 'failed';

export interface ProbeStep {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly timedOut?: boolean;
}

export const demoUnit: UnitManifest = {
  id: 'demo',
  titleKey: 'demo.title', card: { order: 10 },
  tools: [],
  host: { inject: [] },
};

export { panelsUnit };

export function createDiyRig() {
  let root = '';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-diy-tool-'));
    fs.mkdirSync(WORKSHOP(), { recursive: true });
    fs.writeFileSync(path.join(WORKSHOP(), 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const WORKSHOP = (): string => path.join(root, 'workbench', 'diy');
  const PACKAGES = (): string => path.join(WORKSHOP(), 'packages');
  const PROFILE = (): string => path.join(root, 'profiles', 'workbench');

  function writeManifest(at: string, manifest: unknown): void {
    fs.mkdirSync(at, { recursive: true });
    fs.writeFileSync(path.join(at, 'package.json'), JSON.stringify(manifest));
  }

  function scaffold(unit: string, description = `${unit} 的一句话`): string {
    fs.mkdirSync(WORKSHOP(), { recursive: true });
    const config = path.join(WORKSHOP(), 'pnpm-workspace.yaml');
    if (!fs.existsSync(config)) fs.writeFileSync(config, 'packages:\n  - packages/*\n');
    const dir = path.join(PACKAGES(), `module-${unit}`);
    writeManifest(dir, {
      name: `@dsh-workbench/module-${unit}`,
      version: '0.0.0',
      private: true,
      description,
      exports: { '.': './dist/host.js', './client': './client.js' },
      dsh: {
        workbench: { unit },
        workbenchFaces: { host: 'src/host.ts', client: 'src/client.tsx' },
      },
    });
    return dir;
  }

  function markInstalled(pkg: string, at: string): void {
    const link = path.join(PROFILE(), 'node_modules', pkg);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(at, link, 'dir');
    fs.writeFileSync(
      path.join(PROFILE(), 'package.json'),
      JSON.stringify({
        name: 'workbench',
        dependencies: { [pkg]: `link:${at}` },
        dsh: { profile: { bundles: [pkg] } },
      }),
    );
  }

  function outcomeOf(application: Application): BundleInstallOutcome {
    const change = {
      application,
      stage: 'install',
      changed: true,
      target: 'demo',
      errorCode: undefined,
    } as unknown as BundleInstallOutcome['change'];
    const module = {
      kind: 'module',
      pkg: '@dsh-workbench/module-demo',
      unit: 'demo',
      version: '0.0.0',
      registry: undefined,
    } as unknown as BundleInstallOutcome['module'];
    return { change, module, supply: { state: 'no-needs' } };
  }

  const diyExec = (sessionId = 's1'): unknown => ({
    agent: { session: { id: sessionId, header: { cwd: WORKSHOP() } } },
  });
  const NORMAL_EXEC = { agent: { session: { id: 's2', header: { cwd: '/w/a' } } } };

  function fakeShell(plan: readonly ProbeStep[]) {
    const commands: string[] = [];
    let index = 0;
    const shell = {
      resolve(request: { command: string }) {
        commands.push(request.command);
        return request;
      },
      async execute() {
        const step = plan[Math.min(index, plan.length - 1)] ?? {};
        index += 1;
        return {
          result: async () => ({
            exitCode: step.exitCode ?? 0,
            timedOut: step.timedOut ?? false,
            aborted: false,
            stdout: { text: step.stdout ?? '', truncated: false },
            stderr: { text: step.stderr ?? '', truncated: false },
          }),
        };
      },
    };
    return { shell: shell as never, commands };
  }

  let catalogPath: string | undefined;
  let pluginsPath: string | undefined;

  let surfaceOverride: RuntimeCommandSurface | null | undefined;

  function setCatalog(at: string | undefined, plugins?: string): void {
    catalogPath = at;
    pluginsPath = plugins;
  }

  function setSurface(surface: RuntimeCommandSurface | null | undefined): void {
    surfaceOverride = surface;
  }

  function adapters(): ReturnType<typeof testAdaptersWith> {
    return testAdaptersWith({
      root: () => root,
      profile: PROFILE,
      catalog: () => catalogPath,
      plugins: () => pluginsPath,
      ...(surfaceOverride === undefined ? {} : { surface: surfaceOverride }),
    });
  }

  function harness(
    options: {
      manifests?: UnitManifest[];
      outcome?: BundleInstallOutcome;
      withTools?: boolean;
      probe?: readonly ProbeStep[];
      mounted?: readonly string[];
      refused?: readonly { unit: string; reasons: readonly string[] }[];
      failures?: Readonly<Record<string, string>>;
      panelState?: PanelStateStore;
      debug?: DebugStore;
      record?: RecordStore;
      pact?: string | false;
      preview?: (unit: string) => PublishPreview | null;
      authorHint?: (unit: string) => Promise<string | undefined>;
    } = {},
  ) {
    const specs: string[] = [];
    const registered: Array<{
      name: string;
      parameters?: Record<string, unknown>;
      execute: (args: unknown, exec?: unknown) => Promise<unknown>;
    }> = [];
    const probe = options.probe === undefined ? undefined : fakeShell(options.probe);
    const manifests = options.manifests ?? [panelsUnit, demoUnit];
    const mounted = options.mounted ?? manifests.map((one) => one.id);
    const registry = {
      all: () => mounted.map((unit) => ({ unit })),
      refusals: () => options.refused ?? [],
      failureOf: (unit: string) => options.failures?.[unit],
    };
    const panelState = options.panelState ?? createPanelStateStore();
    const raw = options.debug ?? createDebugStore();
    const pact = options.pact === undefined ? 's1' : options.pact;
    if (pact !== false) {
      raw.begin({
        sessionId: pact,
        workspacePath: WORKSHOP(),
        title: '工坊',
        board: WORKSHOP(),
        unit: 'demo',
        name: 'demo',
        now: Date.now(),
      });
    }
    const debug = withObserverCleanup(raw, (workspace) => stopObservers(ctx as never, workspace));
    const record = options.record ?? createRecordStore();
    const ctx = {
      get: (key: string) => {
        if (key === 'tools') {
          if (options.withTools === false) return undefined;
          return {
            register(definition: {
              name: string;
              parameters?: Record<string, unknown>;
              execute: (args: unknown, exec?: unknown) => Promise<unknown>;
            }) {
              registered.push(definition);
              return () => {};
            },
          };
        }
        if (key === WORKBENCH_ADAPTERS) return adapters();
        if (key === UNITS_SERVICE) return registry;
        if (key === PANEL_STATE_SERVICE) return panelState;
        if (key === DIY_DEBUG_SERVICE) return debug;
        if (key === DIY_RECORD_SERVICE) return record;
        if (key === 'dshHomePath') return (relative: string) => path.join(root, relative);
        if (key === 'workspaceRegistry') return fakeWorkspaceRegistry(fakeWorkspace(WORKSHOP()));
        if (key === 'profileContext') return { dir: PROFILE() };
        if (key === 'shell') return probe?.shell;
        return undefined;
      },
      logger: { info: () => {}, warn: () => {} },
    };
    const market = {
      installBundle: async (spec: string): Promise<BundleInstallOutcome> => {
        specs.push(spec);
        return options.outcome ?? outcomeOf('applied');
      },
    };
    const panels = createPanelsService({
      manifests: () => manifests,
      store: createWorkspaceStore({ root }),
    });
    const disposers = [
      ...registerDiyTools(ctx as never, market as never, panels, debug, options.preview, options.authorHint),
      ...registerRecordTools(ctx as never, record),
    ];
    const toolOf = (name: string) => {
      const found = registered.find((one) => one.name === name);
      if (found === undefined) {
        throw new Error(`没有注册 ${name}（注册了：${registered.map((one) => one.name).join(', ')}）`);
      }
      return found;
    };
    return {
      specs,
      registered,
      tool: toolOf,
      ctx,
      panels,
      panelState,
      debug,
      record,
      registry,
      disposers,
      commands: probe?.commands ?? [],
    };
  }

  return {
    root: () => root,
    WORKSHOP,
    PACKAGES,
    PROFILE,
    writeManifest,
    scaffold,
    markInstalled,
    outcomeOf,
    diyExec,
    NORMAL_EXEC,
    fakeShell,
    harness,
    setCatalog,
    setSurface,
  };
}
