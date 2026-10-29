import type { BundleChange, BundleInspectProblem, BundleSupplyState } from '@/kernel/contract/bundle-install';
import type {
  AddModuleOutcome,
  AddModulePhase,
  AddModulePreview,
  AddModuleProblem,
  AddModuleState,
} from './use-add-module';

export interface AddModuleMock {
  readonly id: string;
  readonly label: string;
  readonly phase: AddModulePhase;
  readonly spec: string;
  readonly guideOpen?: boolean;
  readonly problem?: AddModuleProblem;
  readonly preview?: AddModulePreview;
  readonly outcome?: AddModuleOutcome;
  readonly failure?: string;
}

function change(over: Partial<BundleChange>): BundleChange {
  return { application: 'applied', stage: 'install', changed: true, target: '@dsh-workbench/module-hello', ...over };
}

function outcome(
  over: Partial<BundleChange>,
  supply: { state: BundleSupplyState; reason?: string } = { state: 'installed' },
): AddModuleOutcome {
  return {
    change: change(over),
    module: { kind: 'module', pkg: '@dsh-workbench/module-hello', unit: 'hello', version: '0.1.2' },
    supply,
  };
}

function refused(problem: BundleInspectProblem, reason = ''): AddModuleMock {
  return {
    id: `refused-${problem}`,
    label: `预检拒：${problem}`,
    phase: 'idle',
    spec: '@dsh-workbench/module-nope',
    problem: { problem, reason },
  };
}

export const ADD_MODULE_MOCKS: readonly AddModuleMock[] = [
  { id: 'empty', label: '刚打开', phase: 'idle', spec: '' },
  { id: 'typed', label: '填了包名', phase: 'idle', spec: '@dsh-workbench/module-hello' },
  { id: 'guide', label: '展开了示例', phase: 'idle', spec: '', guideOpen: true },
  { id: 'inspecting', label: '正在预检', phase: 'inspecting', spec: '@dsh-workbench/module-hello' },
  refused('invalid-spec'),
  refused('already-installed', '已经在 profile 里：@dsh-workbench/module-hello@0.1.2'),
  refused('not-found'),
  refused('not-a-package'),
  refused('not-a-bundle'),
  refused('not-a-module-or-plugin', '这个包既不是工作台的模块，也不是运行时的插件，装了也用不上'),
  refused('network', 'getaddrinfo ENOTFOUND registry.example.com'),
  refused('unknown', 'pnpm 的返回码是 1'),
  {
    id: 'preview',
    label: '预览（可装）',
    phase: 'preview',
    spec: '@dsh-workbench/module-hello',
    preview: {
      kind: 'module',
      name: '@dsh-workbench/module-hello',
      version: '0.1.2',
      description: '最小样本模块：一枚「你好」卡片',
      registry: 'registry.npmmirror.com',
    },
  },
  {
    id: 'preview-no-source',
    label: '预览（问不出源）',
    phase: 'preview',
    spec: '@dsh-workbench/module-hello',
    preview: {
      kind: 'module',
      name: '@dsh-workbench/module-hello',
      version: '',
      description: '',
      registry: '',
    },
  },
  {
    id: 'preview-plugin',
    label: '预览（插件）',
    phase: 'preview',
    spec: 'acme-plugin-dashboards',
    preview: {
      kind: 'plugin',
      name: 'acme-plugin-dashboards',
      version: '1.0.16',
      description: '',
      registry: 'registry.npmmirror.com',
      pluginName: 'dashboards',
    },
  },
  { id: 'installing', label: '正在安装（可取消）', phase: 'installing', spec: '@dsh-workbench/module-hello' },
  {
    id: 'needs-approval',
    label: '安装脚本待批',
    phase: 'result',
    spec: '@dsh-workbench/module-hello',
    outcome: {
      ...outcome({
        application: 'failed',
        stage: 'install',
        errorCode: 'build-blocked',
        pendingBuilds: ['esbuild', 'sharp'],
      }),
      supply: { state: 'failed', reason: '装上之前得先允许安装脚本' },
    },
  },
  {
    id: 'failed-registry',
    label: '失败：源上没有',
    phase: 'result',
    spec: '@dsh-workbench/module-nope',
    outcome: outcome({ application: 'failed', stage: 'install', failedAt: 'registry', errorCode: 'not-found' }),
  },
  {
    id: 'failed-pnpm',
    label: '失败：pnpm 执行出错',
    phase: 'result',
    spec: '@dsh-workbench/module-hello',
    outcome: outcome({
      application: 'failed',
      stage: 'install',
      errorCode: 'operation-error',
      errorDetail: 'ERR_PNPM_FETCH_404 GET https://registry.example.com/@dsh-workbench%2Fmodule-hello: Not Found',
    }),
  },
  { id: 'done-applied', label: '装好了（已生效）', phase: 'result', spec: '@dsh-workbench/module-hello', outcome: outcome({}) },
  {
    id: 'done-plugin',
    label: '装好了（插件）',
    phase: 'result',
    spec: 'acme-plugin-inventory',
    outcome: {
      change: change({ target: 'acme-plugin-inventory' }),
      module: { kind: 'unknown', pkg: 'acme-plugin-inventory' },
      supply: { state: 'no-needs' },
      plugin: { kind: 'runtime-plugin', pkg: 'acme-plugin-inventory', name: 'inventory' },
    },
  },
  {
    id: 'done-restart',
    label: '装好了（要重启，并说清是哪种：这一格是「某个已装的包换了目录」）',
    phase: 'result',
    spec: '@dsh-workbench/module-hello',
    outcome: outcome(
      { application: 'restart-required', restartReason: 'package-moved' },
      { state: 'pending-restart' },
    ),
  },
  {
    id: 'not-a-module',
    label: '装进来的不是模块',
    phase: 'result',
    spec: 'some-random-package',
    outcome: {
      change: change({ target: 'some-random-package' }),
      module: { kind: 'not-module', pkg: 'some-random-package' },
      supply: { state: 'not-a-module' },
    },
  },
  {
    id: 'cancelled',
    label: '已取消',
    phase: 'result',
    spec: '@dsh-workbench/module-hello',
    outcome: outcome({ application: 'cancelled', changed: false }, { state: 'no-needs' }),
  },
  {
    id: 'done-no-needs',
    label: '装好了（不要额外供给）',
    phase: 'result',
    spec: '@dsh-workbench/module-plain',
    outcome: {
      change: change({ target: '@dsh-workbench/module-plain' }),
      module: { kind: 'module', pkg: '@dsh-workbench/module-plain', unit: 'plain', version: '1.0.0' },
      supply: { state: 'no-needs' },
    },
  },
  {
    id: 'removed',
    label: '移除掉了',
    phase: 'result',
    spec: 'some-random-package',
    outcome: {
      change: change({ stage: 'remove', target: 'some-random-package' }),
      module: { kind: 'not-module', pkg: 'some-random-package' },
      supply: { state: 'not-a-module' },
    },
  },
];

const frozen = (): void => {};

export function stateOfMock(base: AddModuleState, mock: AddModuleMock): AddModuleState {
  return {
    ...base,
    spec: mock.spec,
    guideOpen: mock.guideOpen ?? false,
    phase: mock.phase,
    choices: base.choices,
    custom: '',
    registryOpen: false,
    problem: mock.problem ?? null,
    preview: mock.preview ?? null,
    outcome: mock.outcome ?? null,
    failure: mock.failure ?? null,
    builds: mock.outcome?.change.pendingBuilds ?? [],
    setSpec: frozen,
    setChoice: frozen,
    setCustom: frozen,
    toggleRegistry: frozen,
    closeRegistry: frozen,
    toggleGuide: frozen,
    check: frozen,
    edit: frozen,
    install: frozen,
    cancelInstall: frozen,
    removeIt: frozen,
  };
}
