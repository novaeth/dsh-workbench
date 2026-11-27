import type { CapabilityPayload, NeedState, UnitManifest } from '@dsh-workbench/shared';
import type {
  BundleChange,
  BundleInspectProblem,
  BundleInstallPayload,
  BundleSupplyState,
  ModuleVersion,
  ModuleVersionsPayload,
  WorkbenchVersion,
} from '@dsh-workbench/shared/contract/protocol/bundle-install';
import type { MarketInstalledPayload } from '@dsh-workbench/shared/contract/protocol/market-index';
import type { PanelsPayload, PanelUnitView } from '@dsh-workbench/shared/contract/protocol/panels';
import type { PreflightSnapshot } from '@dsh-workbench/shared/host';
import { BUNDLE_INSPECT_ROUTE, BUNDLE_REGISTRIES_ROUTE, MODULE_VERSIONS_ROUTE } from '@dsh-workbench/shared/contract/protocol/bundle-install';
import { MARKET_INSTALLED_ROUTE } from '@dsh-workbench/shared/contract/protocol/market-index';
import { PANELS_ROUTE } from '@dsh-workbench/shared/contract/protocol/panels';
import { UNIT_MANIFESTS_ROUTE } from '@dsh-workbench/shared/contract/protocol/unit-manifests';
import { SAMPLE_TITLES, SAMPLE_UNIT_IDS, manifestOf, type SampleUnitId } from './units';
import { GATE_MOCKS } from './gates';

export const HEALTH_ROUTE = 'health';
export const CAPABILITY_ROUTE = 'capability';
export const PREFLIGHT_ROUTE = 'preflight';
export const CHANGES_ROUTE = 'changes';
export const INSTALLED_PLUGINS_ROUTE = 'panels/plugins';

export const REAL_SCENE = 'real';

export type SceneWriteReply = 'hold' | 'ok' | Readonly<Record<string, unknown>>;

export type SceneWrite = SceneWriteReply | ((body: Record<string, unknown>) => SceneWriteReply);

export interface UnitFixture {
  readonly unit: SampleUnitId;
  readonly manifest?: Partial<UnitManifest> | undefined;
  readonly status?: CapabilityPayload['status'] | undefined;
  readonly needs?: readonly NeedState[] | undefined;
  readonly installed?: string | undefined;
  readonly latest?: string | undefined;
  readonly local?: boolean | undefined;
  readonly refused?: readonly string[] | undefined;
}


export interface Scene {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly routes: Readonly<Record<string, unknown>>;
  readonly holds?: readonly string[];
  readonly units?: readonly UnitFixture[];
  readonly writes?: Readonly<Record<string, SceneWrite>>;
}

const HEALTH = { ok: true, capabilities: { console: true, pluginMarket: true, browserBridge: true } };

const AT = 1790574156506;

const READY_PREFLIGHT: PreflightSnapshot = {
  phase: 'ready',
  at: AT,
  steps: [
    { id: 'cli', status: 'ok', detail: '2.0.3' },
    { id: 'bridge', status: 'ok', detail: 'Everything looks good!' },
  ],
  paths: { workbenchRoot: '/Users/you/.dsh/workbench', dshHome: '/Users/you/.dsh' },
};

const NO_PANELS: PanelsPayload = { ok: true, units: [], plugins: [], defaults: [], own: false, changed: {} };

const NO_MODULES: ModuleVersionsPayload = { modules: [] };

const NO_MARKET: MarketInstalledPayload = { modules: [] };

const READ_FAILED = { ok: false, error: { code: 'read', message: '安装清单没读出来（假宿主）' } };

const WORKBENCH_VERSION = '1.5.6';

const DEFAULT_WORKBENCH: WorkbenchVersion = { pkg: '@dsh-workbench/core', installed: WORKBENCH_VERSION };

const NO_REGISTRIES = { available: true, registries: { registry: null, fallbackRegistries: [], resolved: null } };

const PREVIEW_REGISTRY = {
  status: 'accepted' as const,
  kind: 'registry' as const,
  name: '@acme/module-hello',
  version: '0.1.2',
  description: '最小样本模块：一枚「你好」卡片',
  bundle: false,
  registry: null,
  host: 'registry.npmjs.org',
};

const REFUSED_PROBLEMS: readonly BundleInspectProblem[] = [
  'invalid-spec',
  'already-installed',
  'not-found',
  'not-a-package',
  'not-a-bundle',
  'not-a-module-or-plugin',
  'not-a-workbench-module',
  'module-builtin-missing',
  'network',
  'unknown',
];

function installReply(input: {
  readonly application?: BundleChange['application'];
  readonly target?: string;
  readonly errorCode?: string;
  readonly errorDetail?: string;
  readonly failedAt?: BundleChange['failedAt'];
  readonly pendingBuilds?: readonly string[];
  readonly restartReason?: BundleChange['restartReason'];
  readonly changed?: boolean;
  readonly module?: BundleInstallPayload['module'];
  readonly supply?: BundleSupplyState;
}): (body: Record<string, unknown>) => SceneWriteReply {
  return () => ({
    ok: true,
    change: {
      application: input.application ?? 'applied',
      stage: 'install',
      changed: input.changed ?? true,
      target: input.target ?? '@acme/module-hello',
      ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
      ...(input.errorDetail === undefined ? {} : { errorDetail: input.errorDetail }),
      ...(input.failedAt === undefined ? {} : { failedAt: input.failedAt }),
      ...(input.pendingBuilds === undefined ? {} : { pendingBuilds: input.pendingBuilds }),
      ...(input.restartReason === undefined ? {} : { restartReason: input.restartReason }),
    },
    module: input.module ?? { kind: 'module', pkg: '@acme/module-hello', unit: 'hello', version: '0.1.2' },
    supply: { state: input.supply ?? 'installed' },
  });
}

function ok<T extends object>(payload: T): { readonly ok: true } & T {
  return { ok: true, ...payload };
}

function needOf(input: {
  readonly name?: string | undefined;
  readonly status: NeedState['status'];
  readonly missing?: readonly string[] | undefined;
  readonly provision?: NeedState['provision'] | undefined;
  readonly installed?: string | undefined;
  readonly latest?: string | undefined;
}): NeedState {
  const name = input.name ?? 'fixture';
  const need: { -readonly [K in keyof NeedState]: NeedState[K] } = {
    id: `extension:${name}`,
    kind: 'extension',
    name,
    status: input.status,
    detail: '夹具',
  };
  if (input.missing !== undefined) need.missing = input.missing;
  if (input.provision !== undefined) need.provision = input.provision;
  if (input.installed !== undefined) need.installed = input.installed;
  if (input.latest !== undefined) need.latest = input.latest;
  return need;
}

function installable(manifest: Partial<UnitManifest>): Partial<UnitManifest> {
  return {
    needs: [
      {
        kind: 'extension',
        runtime: 'opencli',
        name: 'fixture',
        commands: ['x'],
        purpose: '夹具',
        sources: [
          {
            kind: 'npm',
            package: 'acme-plugin-fixture',
            registryEnv: 'WB_FIXTURE_REGISTRY',
            registryDefault: 'https://registry.invalid/',
          },
        ],
      },
    ],
    ...manifest,
  };
}

function unitRoutes(units: readonly UnitFixture[]): Readonly<Record<string, unknown>> {
  const manifests = units.map((item) => ({ ...manifestOf(item.unit), ...item.manifest }));
  const capability = units
    .filter((item) => item.status !== undefined)
    .map((item): CapabilityPayload => ({ unit: item.unit, status: item.status ?? 'ok', needs: item.needs ?? [] }));
  return {
    [UNIT_MANIFESTS_ROUTE]: { ok: true, manifests, installable: units.map((item) => item.unit) },
    [CAPABILITY_ROUTE]: { ok: true, units: capability },
  };
}

function unitModules(units: readonly UnitFixture[]): readonly ModuleVersion[] {
  return units
    .filter((item) => item.installed !== undefined)
    .map(
      (item): ModuleVersion => ({
        unit: item.unit,
        pkg: `@acme/${item.unit}`,
        installed: item.installed ?? '',
        title: { zh: SAMPLE_TITLES[item.unit], en: SAMPLE_TITLES[item.unit] },
        ...(item.latest === undefined ? {} : { latest: item.latest }),
        ...(item.local === true ? { local: true } : {}),
        ...(item.refused === undefined ? {} : { refused: item.refused }),
      }),
    );
}

function scene(input: {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly routes?: Readonly<Record<string, unknown>>;
  readonly holds?: readonly string[];
  readonly units?: readonly UnitFixture[];
  readonly writes?: Readonly<Record<string, SceneWrite>>;
  readonly modules?: readonly ModuleVersion[] | undefined;
  readonly workbench?: WorkbenchVersion | undefined;
  readonly plugins?: readonly InstalledPluginFixture[] | undefined;
  readonly unreadable?: ModuleVersionsPayload['unreadable'] | undefined;
  readonly readFailure?: boolean | undefined;
}): Scene {
  const units = input.units ?? [];
  const versions = {
    ...ok(NO_MODULES),
    modules: input.modules ?? unitModules(units),
    workbench: input.workbench ?? DEFAULT_WORKBENCH,
    ...(input.unreadable === undefined ? {} : { unreadable: input.unreadable }),
  };
  return {
    id: input.id,
    label: input.label,
    note: input.note,
    ...(units.length === 0 ? {} : { units }),
    ...(input.writes === undefined ? {} : { writes: input.writes }),
    routes: {
      [UNIT_MANIFESTS_ROUTE]: ok({ manifests: units.map((item) => ({ ...manifestOf(item.unit), ...item.manifest })), installable: units.map((item) => item.unit) }),
      [HEALTH_ROUTE]: HEALTH,
      [CAPABILITY_ROUTE]: ok({ units: [] }),
      [MODULE_VERSIONS_ROUTE]: input.readFailure === true ? READ_FAILED : versions,
      [MARKET_INSTALLED_ROUTE]: input.readFailure === true ? READ_FAILED : ok(NO_MARKET),
      [INSTALLED_PLUGINS_ROUTE]: ok({ plugins: input.plugins ?? [] }),
      [PANELS_ROUTE]: NO_PANELS,
      [PREFLIGHT_ROUTE]: READY_PREFLIGHT,
      ...unitRoutes(units),
      ...input.routes,
    },
    ...(input.holds === undefined ? {} : { holds: input.holds }),
  };
}

type InstalledPluginFixture = Readonly<Record<string, string | boolean | undefined>>;

const u = (unit: SampleUnitId, over: Partial<UnitFixture> = {}): UnitFixture => ({ unit, status: 'ok', ...over });

const m = (
  id: string,
  label: string,
  note: string,
  units: readonly UnitFixture[],
  over: Readonly<Record<string, unknown>> = {},
): Scene => scene({ id, label, note, units, ...over });

const wb = (id: string, label: string, note: string, workbench: WorkbenchVersion): Scene =>
  scene({ id, label, note, modules: [], workbench });

const pluginScene = (id: string, label: string, note: string, rows: readonly InstalledPluginFixture[]): Scene =>
  scene({ id, label, note, plugins: rows });

const inspectRoutes = (inspection: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> => ({
  [BUNDLE_REGISTRIES_ROUTE]: ok(NO_REGISTRIES),
  [BUNDLE_INSPECT_ROUTE]: ok({ inspection }),
});

const inspect = (
  id: string,
  label: string,
  note: string,
  inspection: Readonly<Record<string, unknown>>,
  writes?: Readonly<Record<string, SceneWrite>>,
): Scene => scene({ id, label, note, routes: inspectRoutes(inspection), ...(writes === undefined ? {} : { writes }) });

const installScene = (
  id: string,
  label: string,
  note: string,
  write: SceneWrite,
): Scene => inspect(id, label, note, PREVIEW_REGISTRY, { provision: write });

function panelScene(
  id: string,
  label: string,
  note: string,
  units: readonly PanelUnitView[],
  caps: readonly CapabilityPayload[],
  over: Readonly<Record<string, unknown>> = {},
): Scene {
  return scene({
    id,
    label,
    note,
    units: units.map((item) => ({ unit: item.id as SampleUnitId, ...(caps.find((cap) => cap.unit === item.id) === undefined ? {} : { status: 'ok' as const }) })),
    routes: { [PANELS_ROUTE]: { ...NO_PANELS, units }, [CAPABILITY_ROUTE]: ok({ units: caps }) },
    ...over,
  });
}

const build = (item: PanelUnitView): PanelUnitView => item;
const PANEL_IDS: readonly PanelUnitView[] = [
  build({ id: 'fixture-argocd', titleKey: 'fixture-argocd.title', shown: true, source: 'user', hasCard: true }),
  build({ id: 'fixture-cmdb', titleKey: 'fixture-cmdb.title', shown: true, source: 'user', hasCard: true }),
  build({ id: 'fixture-demo', titleKey: 'fixture-demo.title', shown: false, source: 'user', hasCard: true }),
];

const capOk = (unit: string): CapabilityPayload => ({ unit, status: 'ok', needs: [] });

const PLUGIN_OUTDATED: InstalledPluginFixture = {
  pkg: 'acme-plugin-inventory',
  name: 'inventory',
  installed: '1.0.24',
  latest: '1.0.25',
  registry: 'https://r.example/team/',
  installedAt: '2026-09-30T08:00:00.000Z',
};

const ARGOCD = u('fixture-argocd', { needs: [needOf({ status: 'ok' })], installed: '1.1.10' });

const envMissing = (env: string): UnitFixture =>
  u('fixture-argocd', {
    status: 'missing',
    needs: [needOf({ status: 'missing', provision: 'env-missing' })],
    manifest: installable({ needs: [{ kind: 'extension', runtime: 'opencli', name: 'fixture', commands: ['x'], purpose: '夹具', sources: [{ kind: 'local', env }] }] }),
  });

const PANEL_PLUGINS: PanelsPayload = {
  ok: true,
  units: [],
  plugins: [
    { id: 'plugin:inventory', pkg: 'acme-plugin-inventory', title: 'inventory', shown: true, source: 'user' },
    { id: 'plugin:notes', pkg: 'acme-plugin-notes', title: 'notes', shown: false, source: 'user' },
  ],
  defaults: [],
  own: false,
  changed: {},
};

export const SCENES: readonly Scene[] = [
  scene({ id: 'market-empty', label: '市场空态（干净机器）', note: '一个模块都没装：工作台本体那一行常驻，已安装段为空' }),
  m('market-installed', '已装', '一条已装：有版本、有「卸载」', [ARGOCD]),
  m('market-outdated', '缺必需命令', '行上只说「有新版本」，不点名缺什么', [
    u('fixture-argocd', { status: 'outdated', installed: '1.1.10', needs: [needOf({ status: 'missing', missing: ['x'] })] }),
  ]),
  m('market-module-update', '模块包有新版本', '行上给「更新」，装了要重启', [
    u('fixture-argocd', { installed: '0.1.2', latest: '0.2.0', needs: [needOf({ status: 'ok' })] }),
  ]),
  m('market-outdated-release', '依赖有新版本', '模块版本没变，行上给「更新依赖」', [
    u('fixture-argocd', { status: 'outdated', installed: '1.1.10', needs: [needOf({ status: 'outdated', missing: [], installed: '1.0.16', latest: '1.0.17' })] }),
  ]),
  m('market-missing', '未装（可装）', '状态 missing、装法 ready：行上给「安装」', [
    u('fixture-argocd', { status: 'missing', manifest: installable({}), needs: [needOf({ status: 'missing', missing: ['x'], provision: 'ready' })] }),
  ]),
  m('market-missing-env', '未装 + 要先设环境变量', '供给源要一个环境变量：行上只说明、不给安装', [envMissing('WB_FIXTURE_HOME')]),
  m('market-missing-undeclared', '未装 + 没声明怎么装', '宿主没给装法：行上不给按钮', [
    u('fixture-argocd', { status: 'missing', needs: [needOf({ status: 'missing', provision: 'not-declared' })] }),
  ]),
  m('market-unknown', '探测失败（状态未知）', '能力里没有这一条：行上写「状态未知」', [{ unit: 'fixture-argocd' }]),
  m('market-checking', '检测中', '能力读口不回：行上一直转圈', [{ unit: 'fixture-argocd' }], { holds: [CAPABILITY_ROUTE] }),
  m('market-shared', '两个模块（同一份安装）', '两行共用同一份供给', [ARGOCD, u('fixture-cmdb', { installed: '1.1.13', needs: [needOf({ status: 'ok' })] })]),
  m('market-busy', '正在装', '点「安装」看这一屏（写请求会挂起）', [
    u('fixture-argocd', { status: 'missing', manifest: installable({}), needs: [needOf({ status: 'missing', missing: ['x'], provision: 'ready' })] }),
  ], { writes: { provision: 'hold' } }),
  m('market-confirm', '等确认卸载', '点「卸载」看确认卡（这一步是客户端状态）', [ARGOCD]),
  m('market-failed', '失败（红字贴行）', '点「卸载」，写请求回失败', [ARGOCD], {
    writes: { provision: { ok: false, error: { code: 'fixture', message: '没成功：命令失败（退出码 1）：夹具里的一条失败原因' } } },
  }),
  m('market-long-title', '超长模块名', '省略号会不会把按钮挤下去', [u('fixture-long', { installed: '1.1.10' })]),
  m('market-long-env', '超长环境变量名', '环境变量名特别长时行怎么排', [envMissing('DSH_WORKBENCH_SOMETHING_VERY_LONG_ENV_NAME_FOR_THE_MODULE')]),
  m('market-long-error', '超长错误信息', '失败卡里的长路径会不会溢出', [ARGOCD], {
    writes: {
      provision: {
        ok: false,
        error: {
          code: 'fixture',
          message:
            "没成功：命令失败（退出码 1）：Error: EPERM: operation not permitted, unlink '/Users/someone/.dsh/workbench/opencli/home/.opencli/plugins/acme-permission-copy-with-a-very-long-directory-name'",
        },
      },
    },
  }),
  m('market-two-deps', '两份依赖（只装缺的）', '两条 need：一条好、一条缺', [
    u('fixture-argocd', {
      status: 'missing',
      needs: [needOf({ status: 'ok' }), needOf({ name: 'fixture-second', status: 'missing', missing: ['y'], provision: 'ready' })],
      manifest: installable({
        needs: [
          { kind: 'extension', runtime: 'opencli', name: 'fixture', commands: ['x'], purpose: '夹具', sources: [{ kind: 'npm', package: 'acme-plugin-fixture' }] },
          { kind: 'extension', runtime: 'opencli', name: 'fixture-second', commands: ['y'], purpose: '夹具' },
        ],
      }),
    }),
  ]),
  m('market-many', '很多行（要滚）', '八行已装', SAMPLE_UNIT_IDS.map((unit) => u(unit, { installed: '1.1.10' }))),
  m('market-no-supply', '没有环境依赖的模块', '供给是基座命令那种：市场里有它这一行', [u('fixture-plain', { installed: '0.1.2', manifest: { needs: undefined } })]),
  m('market-no-card', '没有卡片的模块', '市场里有这一行，有版本、有「更新」', [u('fixture-plain', { installed: '0.1.2', latest: '0.2.0', manifest: { card: null, needs: undefined } })]),
  m('market-local-no-update', '本机那份（link: 装的）', '有「本地」标记、不给「更新」', [u('fixture-argocd', { installed: '0.1.0', local: true })]),
  scene({
    id: 'market-installed-refused',
    label: '本机装了，但宿主不认它的声明',
    note: '行上说得出理由（只有本机清单、没有目录行）',
    modules: [{ unit: 'fixture-argocd', pkg: '@acme/fixture-argocd', installed: '0.1.2', title: { zh: 'argocd', en: 'argocd' }, refused: ['dsh.workbench 缺 apiVersion —— 协议从 v3 起，写 "apiVersion": 3'] }],
  }),
  scene({ id: 'market-installed-pending', label: '本机装了、宿主还没加载它', note: '重启一次就会出来（行上写「未知」并指路）', modules: [{ unit: 'fixture-argocd', pkg: '@acme/fixture-argocd', installed: '0.1.2', title: { zh: 'argocd', en: 'argocd' } }] }),
  scene({ id: 'market-installed-pending-update', label: '本机装了、还没加载 + 源上有新版本', note: '给「更新」，也说明要重启', modules: [{ unit: 'fixture-argocd', pkg: '@acme/fixture-argocd', installed: '0.1.0', latest: '0.1.2', title: { zh: 'argocd', en: 'argocd' } }] }),
  m('market-first-paint', '刚进页面（检测中）', '能力与本机清单都还没结论：整页「检测中」', [ARGOCD], { holds: [CAPABILITY_ROUTE, MODULE_VERSIONS_ROUTE, MARKET_INSTALLED_ROUTE] }),
  scene({ id: 'market-unreadable', label: '有模块读不出来', note: '三份坏模块：段头挂徽标', unreadable: [{ pkg: '@acme/missing', reason: '找不到这个模块的文件' }, { pkg: '@acme/locked', reason: '没有权限读这个模块' }, { pkg: '@acme/broken', reason: '这个模块的文件读不出来' }] }),
  scene({ id: 'market-read-failed', label: '已装清单读失败', note: '读口回错：市场显示重试卡，不落成空态', readFailure: true }),
  pluginScene('market-plugin-outdated', '插件：有新版本', '给更新 / 卸载', [PLUGIN_OUTDATED]),
  pluginScene('market-plugin-local', '插件：本地目录装的', '没有版本源，只给卸载', [{ pkg: '/Users/me/my-local-plugin', name: 'my-local-plugin', local: true, installedAt: '2026-09-30T08:00:00.000Z' }]),
  pluginScene('market-plugin-alias', '插件名 ≠ 包名', '行上两个都写出来（按包名更新 / 卸载）', [PLUGIN_OUTDATED]),
  pluginScene('market-plugin-broken', '插件装坏了', '目录在但看不出是个插件：直说，给卸载与指路', [{ ...PLUGIN_OUTDATED, broken: true }]),
  wb('market-workbench-update', '工作台有新版本', '这一行给「更新」', { pkg: '@dsh-workbench/core', installed: '0.1.18', latest: '0.1.19' }),
  wb('market-workbench-current', '工作台已经最新', '只显示版本，没有按钮', { pkg: '@dsh-workbench/core', installed: '0.1.19' }),
  wb('market-workbench-local', '工作台是源码目录那份', 'link: 装的：不给更新，打「本地」', { pkg: '@dsh-workbench/core', installed: '0.1.18', latest: '0.1.19', local: true }),
  wb('market-workbench-restart', '工作台更新完待重启', '装的是 0.1.19、运行的是 0.1.18：黄点「重启后生效」', { pkg: '@dsh-workbench/core', installed: '0.1.19', running: '0.1.18' }),
  wb('market-workbench-migrate', '工作台：旧数据待迁移', '迁移 / 不再提醒都有二次确认', { pkg: '@dsh-workbench/core', installed: '0.1.19', followUp: { id: 'data-root-migration', kind: 'data-migration', hard: false } }),
  wb('market-workbench-migrating', '工作台：迁移中', '点「迁移」看行内转圈、按钮禁用', { pkg: '@dsh-workbench/core', installed: '0.1.19', followUp: { id: 'data-root-migration', kind: 'data-migration', hard: false } }),
  wb('market-workbench-followup-hard', '工作台：硬性待办', '只给迁移，没有「不再提醒」', { pkg: '@dsh-workbench/core', installed: '0.1.19', followUp: { id: 'data-root-migration', kind: 'data-migration', hard: true } }),
  wb('market-workbench-restart-local', '源码目录那份永远等于装着的那份', '不亮「待重启」、也不劝重启', { pkg: '@dsh-workbench/core', installed: '0.1.19', running: '0.1.18', local: true }),
  panelScene('panel-rows', '面板三行', '两行开着、一行关着；开关与拖动都是真的', PANEL_IDS, [capOk('fixture-argocd'), capOk('fixture-cmdb'), capOk('fixture-demo')]),
  panelScene('panel-one', '面板一行', '一行：已启用、装好了', [PANEL_IDS[0]!], [capOk('fixture-argocd')]),
  panelScene('panel-off', '面板：已停用', '开关关着（行还在，卡片不上板）', [{ ...PANEL_IDS[1]!, shown: false }], [capOk('fixture-cmdb')]),
  panelScene('panel-missing', '面板：没装好 → 不列', '能力 missing：这一行不进列表（去市场装）', [PANEL_IDS[1]!], [{ unit: 'fixture-cmdb', status: 'missing', needs: [] }]),
  panelScene('panel-outdated', '面板：缺命令 → 不列', '能力 outdated：同样不进列表', [PANEL_IDS[1]!], [{ unit: 'fixture-cmdb', status: 'outdated', needs: [] }]),
  panelScene('panel-unchecked', '面板：检测不了', '能力 unchecked：行在、徽标说「检测不了」', [PANEL_IDS[1]!], [{ unit: 'fixture-cmdb', status: 'unchecked', needs: [] }]),
  panelScene('panel-many', '面板：顺序与停用混着', '三行：顺序 / 停用混着', PANEL_IDS, [capOk('fixture-argocd'), capOk('fixture-cmdb'), capOk('fixture-demo')]),
  panelScene('panel-no-card', '面板：没看板的模块', '也列出来、带「无看板」标签，开关照常能用', [{ id: 'fixture-plain', titleKey: 'fixture-plain.title', shown: true, source: 'user', hasCard: false }], [capOk('fixture-plain')]),
  panelScene('panel-long', '面板：超长模块名', '省略号与开关的位置', [{ id: 'fixture-long', titleKey: 'fixture-long.title', shown: true, source: 'user', hasCard: true }], [capOk('fixture-long')]),
  panelScene('panel-hidden', '面板：卸载后不显示', '未启用 + 没装：配置里有、列表里不出现', [{ ...PANEL_IDS[1]!, shown: false }], [{ unit: 'fixture-cmdb', status: 'missing', needs: [] }]),
  panelScene('panel-busy', '面板：正在改配置', '点开关看禁用（写请求会挂起）', [PANEL_IDS[1]!], [capOk('fixture-cmdb')], { writes: { 'prefs/panels': 'hold' } }),
  panelScene('panel-failed', '面板：改配置失败', '点开关，写请求回失败（红字）', [PANEL_IDS[1]!], [capOk('fixture-cmdb')], { writes: { 'prefs/panels': { ok: false, error: { code: 'fixture', message: '没成功：改配置失败（夹具）' } } } }),
  panelScene('panel-drag', '面板：拖动落点', '按住行拖起来看落点提示（客户端状态）', [PANEL_IDS[1]!], [capOk('fixture-cmdb')]),
  panelScene('panel-checking', '面板：还没探到', '能力读口不回：没有徽标', [PANEL_IDS[1]!], [], { holds: [CAPABILITY_ROUTE] }),
  scene({ id: 'panel-plugins', label: '面板插件行', note: '插件行：一条开着、一条关着', routes: { [PANELS_ROUTE]: PANEL_PLUGINS } }),
  scene({ id: 'panel-empty', label: '面板列表空', note: '一个模块都没开：空态与它的两条出路' }),
  scene({ id: 'panel-unread', label: '面板配置还没读到', note: '面板读口一直不回：看板说「正在读取」、列表不落空态', holds: [PANELS_ROUTE] }),
  ...REFUSED_PROBLEMS.map((problem) =>
    inspect(`add-refused-${problem}`, `添加模块：预检拒 / ${problem}`, '输入框里填任意包名，预检回这一条', { status: 'refused', problem, reason: `假宿主：${problem}` }),
  ),
  inspect('add-preview', '添加模块：可装', '输入框里填任意包名，预检通过', PREVIEW_REGISTRY),
  inspect('add-preview-no-source', '添加模块：预览（问不出源）', '来源那一格是空的', { ...PREVIEW_REGISTRY, host: undefined }),
  inspect('add-preview-git', '添加模块：预览（Git 来源）', 'repo / ref / 目录都写出来', {
    status: 'accepted',
    kind: 'git',
    name: '@acme/module-wallet-details',
    version: '1.4.0',
    description: '钱包明细看板：按日汇总，点开看流水',
    bundle: false,
    registry: null,
    host: 'git.example.com',
    origins: ['git+ssh://git@git.example.com/acme/dsh-workbench-market.git#e87c7a16fa5&path:/artifacts/@acme/module-wallet-details'],
  }),
  inspect('add-preview-plugin', '添加模块：预览（插件）', '装的是运行时插件，不是工作台模块', { status: 'plugin', pkg: 'acme-plugin-dashboards', registry: null, pluginName: 'dashboards', version: '1.0.16' }),
  inspect('add-installing', '添加模块：正在安装（可取消）', '点「运行」开始装：写请求挂起；点取消回「已取消」', PREVIEW_REGISTRY, {
    provision: (body) =>
      body.action === 'cancel'
        ? { ok: true, cancellation: 'cancelled' }
        : body.action === 'install'
          ? 'hold'
          : { ok: false, error: { code: 'fixture', message: '假宿主：夹具里不执行这个动作' } },
  }),
  installScene('add-needs-approval', '添加模块：安装脚本待批', '装载成功但被脚本审批拦住：给出待批的脚本', installReply({ application: 'failed', errorCode: 'build-blocked', pendingBuilds: ['esbuild', 'sharp'], supply: 'failed' })),
  installScene('add-failed-registry', '添加模块：失败 / 源上没有', '失败卡写「源上没有」', installReply({ application: 'failed', failedAt: 'registry', errorCode: 'not-found', supply: 'failed' })),
  installScene('add-failed-pnpm', '添加模块：失败 / 执行出错', '带一段原文', installReply({ application: 'failed', errorCode: 'operation-error', errorDetail: 'ERR_PNPM_FETCH_404 GET https://registry.example.com/@dsh-workbench%2Fmodule-hello: Not Found', supply: 'failed' })),
  installScene('add-failed-host', '添加模块：失败 / 宿主只回一句话', '不是一个完整信封：界面仍要有一句人话', {
    ok: false,
    installFailure: {
      kind: 'unknown',
      command: "opencli plugin install 'C:\\Users\\me\\.dsh\\workbench\\opencli\\plugins-npm\\node_modules\\opencli-plugin-grafana'",
      exitCode: 1,
      output: 'ERR_PNPM_FETCH_401 GET https://registry.example.com/opencli-plugin-grafana: Unauthorized',
      current: { uid: 0, gid: 0 },
      fix: { kind: 'handoff' },
    },
  }),
  installScene('add-done-applied', '添加模块：装好了（已生效）', '结果屏', installReply({})),
  inspect('add-done-plugin', '添加模块：装好了（插件）', '结果屏：插件行', { status: 'plugin', pkg: 'acme-plugin-inventory', registry: null, pluginName: 'inventory', version: '1.0.16' }, {
    provision: { ok: true, change: { application: 'applied', stage: 'install', changed: true, target: 'acme-plugin-inventory' }, module: { kind: 'unknown', pkg: 'acme-plugin-inventory' }, supply: { state: 'no-needs' }, plugin: { kind: 'runtime-plugin', pkg: 'acme-plugin-inventory', name: 'inventory' } },
  }),
  installScene('add-done-restart', '添加模块：装好了（要重启）', '说清是哪种：某个已装的包换了目录', installReply({ application: 'restart-required', restartReason: 'package-moved', supply: 'pending-restart' })),
  installScene('add-not-a-module', '添加模块：装进来的不是模块', '给「移除」与指路', () => ({
    ok: true,
    change: { application: 'applied', stage: 'install', changed: true, target: 'some-random-package' },
    module: { kind: 'not-module', pkg: 'some-random-package' },
    supply: { state: 'not-a-module' },
  })),
  installScene('add-cancelled', '添加模块：已取消', '结果屏：这一趟取消了', installReply({ application: 'cancelled', changed: false, supply: 'no-needs' })),
  inspect('add-removed', '添加模块：移除掉了', '结果屏：不是模块的那一份被移除', PREVIEW_REGISTRY, {
    provision: { ok: true, change: { application: 'applied', stage: 'remove', changed: true, target: 'some-random-package' }, module: { kind: 'not-module', pkg: 'some-random-package' }, supply: { state: 'not-a-module' } },
  }),
  ...GATE_MOCKS.map((gate) => scene({ id: `boot-${gate.id}`, label: `启动页：${gate.label}`, note: gate.note, routes: { [PREFLIGHT_ROUTE]: gate.snapshot } })),
];

export function sceneById(id: string): Scene | undefined {
  return SCENES.find((scene) => scene.id === id);
}
