import type { DataReader, DataRequest, DataResult, RecipeCalls, RecipeResults, RequestRecipe } from '../contract/data.js';
import type { AdapterSet } from '../host/adapters.js';
import type { EnvSupplyPort, ModulePort, ProbePort, ProfilePort, RuntimePort, SupplyPort } from '../host/port-types.js';
import type { HostActions } from '../host/port-types.js';
import type { PluginSurface } from '../host/port-types.js';
import { ADAPTER_SET_API_VERSION } from '../host/adapters.js';
import { readBundleManager } from '../host/bundle-manager.js';

export const FAKE_ADAPTER_MARKER = { adapterSet: 'fake' } as const;

function result<T>(): DataResult<T> {
  return { ok: true, data: FAKE_ADAPTER_MARKER as unknown as T };
}

const data: DataReader = {
  async read<T = unknown>(_request: DataRequest): Promise<DataResult<T>> {
    return result<T>();
  },
  async request<T = unknown>(_recipe: RequestRecipe): Promise<DataResult<T>> {
    return result<T>();
  },
  async requestMany<T = unknown>(_recipe: RequestRecipe, _calls: RecipeCalls): Promise<RecipeResults<T>> {
    return {};
  },
  async submit<T = unknown>(_recipe: RequestRecipe): Promise<DataResult<T>> {
    return result<T>();
  },
};

const supply: EnvSupplyPort = {
  resolvePluginSource: () => ({ ok: false, problem: 'not-declared' }),
  libInstallCommand: () => '',
  libUninstallCommand: () => '',
  pluginInstallPlan: () => ({ ok: false, problem: 'not-declared' }),
  latestVersion: async () => undefined,
  missingReleaseParts: async () => [],
  probeRelease: async () => undefined,
  splitNpmSpec: () => undefined,
};

interface CtxLike {
  get?: <T = unknown>(name: string, optional?: boolean) => T | undefined;
}

function fromCtx<T>(ctx: CtxLike | undefined, name: string): T | undefined {
  try {
    return ctx?.get === undefined ? undefined : (ctx.get(name) as T | undefined);
  } catch {
    return undefined;
  }
}

const modules: ModulePort = {
  isolatedRoot: () => '/tmp/dsh-workbench-fake',
  isolatedHome: () => '/tmp/dsh-workbench-fake/home',
  pluginPackagePrefix: () => 'fake-plugin-',
  pluginManifestFile: () => 'fake-plugin.json',
  cliCatalogPath: () => '/tmp/dsh-workbench-fake/catalog.json',
  vendorPluginsDir: () => '/tmp/dsh-workbench-fake/plugins',
  runtimeInstallCommand: () => 'npm i -g fake-runtime',
  afterLibInstall: () => undefined,
  profileDirOf: (ctx) => {
    const context = fromCtx<{ readonly dir?: string }>(ctx as CtxLike, 'profileContext');
    return typeof context?.dir === 'string' ? context.dir : null;
  },
  profileModules: () => [],
  readInstalledModule: () => ({}) as never,
  readProfilePackage: () => undefined,
  readBundleManager,
  createRegistryNotebook: () => ({}) as never,
  declarationGaps: () => undefined,
  moduleDeclarationOf: () => undefined,
  registryDeclarationOf: async () => undefined,
  pathDeclarationOf: () => undefined,
  declarationRefusalOf: () => [],
  refusalReason: () => 'fake',
  packageRouteOf: async () => undefined,
  isNewerVersion: () => false,
  startSelfUpdate: () => ({}) as never,
};

const profile: ProfilePort = {
  dirOf: () => null,
  dshPlugins: () => () => ({ ok: true, plugins: [] }),
  selfUpdateView: () => undefined,
};

const probe: ProbePort = {
  probeUnits: async () => [],
  registerPreflight: () => undefined,
  declaredPluginCommands: () => new Map(),
};

const runtimePreset = (capabilities: RuntimePort['capabilities'] extends never ? never : ReturnType<RuntimePort['capabilities']>): RuntimePort => ({
  packageRoot: () => '/tmp/dsh-workbench-fake',
  capabilities: () => capabilities,
  profile: () => ({
    label: 'fake',
    terms: {
      plugin: { zh: '插件', en: 'plugin' },
      pluginOf: { zh: '的插件', en: 'a plugin of' },
      pluginThing: { zh: '插件', en: 'a plugin' },
      pluginArea: { zh: '插件区', en: 'the plugin area' },
    },
    installHint: { zh: '无', en: 'nothing to install' },
    diagnose: {},
  }),
  commandSurface: () => ({
    name: 'fake',
    pluginPrefix: 'fake-plugin-',
    invoke: (site: string, command?: string) => (command === undefined ? `fake ${site}` : `fake ${site} ${command}`),
    help: (site: string) => `fake ${site} --help`,
    browser: (verb: readonly string[]) => `fake browser ${verb.join(' ')}`,
  }),
  commands: () => ({}),
  runners: () => ({}),
  health: () => ({}),
  seed: () => undefined,
  warnUnwritableRoot: () => undefined,
});

const plugins: PluginSurface = {
  declarationLookup: () => () => undefined,
  createUnits: () => ({
    refresh: async () => ({ units: [] }),
    touch: () => undefined,
    report: () => ({ units: [] }),
    dispose: () => undefined,
  }),
};

const actions: HostActions = {
  configSyncHandler: () => (async () => ({ ok: true })) as never,
  profileCreateHandler: () => (async () => ({ ok: true })) as never,
  configSyncAction: () => ({}) as never,
  profileCreateAction: () => ({}) as never,
};

export function fakeAdapterSet(overrides: Partial<AdapterSet> = {}): AdapterSet {
  return {
    apiVersion: ADAPTER_SET_API_VERSION,
    id: 'fake-adapter-set',
    version: '0.0.0',
    data,
    supply: { ...supply, ...modules, env: supply, modules } as SupplyPort,
    modules,
    profile,
    probe,
    runtime: runtimePreset({
      console: false,
      pluginMarket: false,
      browserBridge: false,
    }),
    plugins,
    actions,
    ...overrides,
  };
}
