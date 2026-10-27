import type { DataReader, DataRequest, DataResult, RecipeCalls, RecipeResults, RequestRecipe } from '@dsh-workbench/shared';
import type { CoreAdapterSet, EnvSupplyPort, ProbePort, ProfilePort } from '@dsh-workbench/shared/host';
import { ADAPTER_SET_API_VERSION } from '@dsh-workbench/shared/host';

export const FIXTURE_MARKER = { adapterSet: 'fixture' } as const;

const data: DataReader = {
  async read<T = unknown>(_request: DataRequest): Promise<DataResult<T>> {
    return { ok: true, data: FIXTURE_MARKER as T };
  },
  async request<T = unknown>(_recipe: RequestRecipe): Promise<DataResult<T>> {
    return { ok: true, data: FIXTURE_MARKER as T };
  },
  async requestMany<T = unknown>(_recipe: RequestRecipe, _calls: RecipeCalls): Promise<RecipeResults<T>> {
    return {};
  },
  async submit<T = unknown>(_recipe: RequestRecipe): Promise<DataResult<T>> {
    return { ok: true, data: FIXTURE_MARKER as T };
  },
};

const supply: EnvSupplyPort = {
  resolvePluginSource: () => ({ ok: false, problem: 'not-declared' }),
  libInstallCommand: () => '',
  pluginInstallPlan: () => ({ ok: false, problem: 'not-declared' }),
  latestVersion: async () => undefined,
  missingReleaseParts: async () => [],
  probeRelease: async () => undefined,
  splitNpmSpec: () => undefined,
};

const profile: ProfilePort = {
  dirOf: () => null,
  dshPlugins: () => () => ({ ok: true, plugins: [] }),
  selfUpdateView: () => undefined,
};

const probe: ProbePort = {
  probeUnits: async () => [],
  registerPreflight: () => {},
  declaredPluginCommands: () => new Map(),
};

export function createAdapterSet(): CoreAdapterSet {
  return {
    apiVersion: ADAPTER_SET_API_VERSION,
    id: '@dsh-workbench/adapter-fixture',
    version: '0.0.0',
    data,
    supply,
    profile,
    probe,
  };
}
