import type { Provenance, ValidationResult, World, WorldProblem } from './types';

type ProvenanceProblem = readonly [code: string, message: string];

function provenanceProblems(provenance: Provenance): readonly ProvenanceProblem[] {
  if (provenance.kind === 'captured') {
    return [
      ...(provenance.hostVersion === '' ? ([['provenance', 'captured 缺 hostVersion']] as const) : []),
      ...(provenance.at === '' ? ([['provenance', 'captured 缺抓取时间']] as const) : []),
    ];
  }
  if (provenance.kind === 'derived') {
    return [
      ...(provenance.from === '' ? ([['provenance', 'derived 缺来源场景']] as const) : []),
      ...(provenance.changed.length === 0
        ? ([['provenance', 'derived 必须列出改动字段']] as const)
        : []),
    ];
  }
  if (provenance.kind === 'fault') {
    return provenance.fault === '' ? [['provenance', 'fault 缺故障名']] : [];
  }
  return provenance.note === '' ? [['provenance', 'transport 缺说明']] : [];
}

export function validateWorld(input: World): ValidationResult {
  const problems: WorldProblem[] = [];
  const add = (code: string, at: string, message: string): void => {
    problems.push({ code, at, message });
  };

  if (input.schemaVersion !== 1) add('schema', 'schemaVersion', '只认 schemaVersion 1');

  for (const [code, message] of provenanceProblems(input.provenance)) add(code, 'provenance', message);

  const sourceIds = new Set(input.market.sources.map((source) => source.id));

  const catalogUnits = new Set((input.catalog?.manifests ?? []).map((manifest) => manifest.id));
  const moduleUnits = new Set<string>();
  for (const module of input.machine.modules) {
    if (module.unit === '') add('module', 'machine.modules', '模块缺 unit');
    if (moduleUnits.has(module.unit)) add('duplicate', `machine.modules.${module.unit}`, '同一个 unit 出现两次');
    moduleUnits.add(module.unit);
    if (module.pkg === '') add('module', `machine.modules.${module.unit}`, '模块缺包名');
    if (module.installed === '') add('module', `machine.modules.${module.unit}`, '模块缺已装版本');
    if (module.local === true && module.latest !== undefined) {
      add('module', `machine.modules.${module.unit}`, '本地那份（link: 装的）不该同时有远端新版本');
    }
    if ((module.refused ?? []).length === 0 && module.manifest === undefined) {
      add('module', `machine.modules.${module.unit}`, '已装模块必须有 manifest，或在 refused 里说明宿主为什么认不出');
    }
    if (module.manifest !== undefined && module.manifest.id !== module.unit) {
      add('module', `machine.modules.${module.unit}`, 'manifest 的 id 与 unit 不一致');
    }
    if (module.sourceId !== undefined && module.sourceId !== 'local' && !sourceIds.has(module.sourceId)) {
      add('market', `machine.modules.${module.unit}`, `来源 ${module.sourceId} 不在模块来源列表里`);
    }
  }

  const capabilityUnits = new Set<string>();
  for (const row of input.machine.capabilities) {
    if (capabilityUnits.has(row.unit)) add('duplicate', `machine.capabilities.${row.unit}`, '同一个 unit 出现两次');
    capabilityUnits.add(row.unit);
    if (!moduleUnits.has(row.unit) && !catalogUnits.has(row.unit)) {
      add('capability', `machine.capabilities.${row.unit}`, '能力行对应的模块既不在已装清单也不在声明清单里');
    }
  }

  const workspaceIds = new Set<string>();
  for (const workspace of input.workspaces) {
    if (workspace.id === '') add('workspace', 'workspaces', '工作区缺 id');
    if (workspaceIds.has(workspace.id)) add('duplicate', `workspaces.${workspace.id}`, '同一个工作区出现两次');
    workspaceIds.add(workspace.id);
    const pending = new Set(workspace.pendingUnits ?? []);
    const withdrawn = new Set(workspace.withdrawnUnits ?? []);
    const seen = new Set<string>();
    const seenPlugins = new Set<string>();
    for (const row of workspace.plugins ?? []) {
      if (seenPlugins.has(row.pkg)) add('duplicate', `workspaces.${workspace.id}`, `插件 ${row.pkg} 配置了两次`);
      seenPlugins.add(row.pkg);

    }
    for (const row of workspace.units) {
      if (seen.has(row.unit)) add('duplicate', `workspaces.${workspace.id}`, `模块 ${row.unit} 配置了两次`);
      seen.add(row.unit);
      if (!moduleUnits.has(row.unit) && !catalogUnits.has(row.unit) && !pending.has(row.unit) && !withdrawn.has(row.unit)) {
        add(
          'workspace',
          `workspaces.${workspace.id}.${row.unit}`,
          '面板配置引用了没装的模块（如确实是待装/待摘，写进 pendingUnits / withdrawnUnits）',
        );
      }
    }
  }

  const workbench = input.machine.workbench;
  if (workbench.pkg === '') add('workbench', 'machine.workbench', '工作台本体行缺包名');
  if (workbench.broken !== true && workbench.installed === '') {
    add('workbench', 'machine.workbench', '工作台本体行缺已装版本（损坏时请显式 broken）');
  }
  if (workbench.local === true && workbench.latest !== undefined) {
    add('workbench', 'machine.workbench', '本地那份不该同时有远端新版本');
  }

  const seenSources = new Set<string>();
  for (const source of input.market.sources) {
    if (source.id === '') add('market', 'market.sources', '模块来源缺 id');
    if (seenSources.has(source.id)) add('duplicate', `market.sources.${source.id}`, '同一个来源出现两次');
    seenSources.add(source.id);
    if (source.label === '') add('market', `market.sources.${source.id}`, '模块来源缺名字');
  }

  for (const [route, mode] of Object.entries(input.writes ?? {})) {
    if (route.trim() === '') add('write', 'writes', '写行为缺路由名');
    if (mode.kind === 'fail' && (mode.code === '' || mode.message === '')) {
      add('write', `writes.${route}`, '写失败要给出 code 与 message');
    }
    if (mode.kind === 'fail' && mode.status !== undefined && (mode.status < 100 || mode.status > 599)) {
      add('write', `writes.${route}`, '写失败的 HTTP 状态码不合法');
    }
  }

  for (const [route, mode] of Object.entries(input.faults)) {
    if (route.trim() === '') add('fault', 'faults', '故障缺路由名');
    if (mode.kind === 'http' && (mode.status < 100 || mode.status > 599)) {
      add('fault', `faults.${route}`, `HTTP 状态码不合法：${mode.status}`);
    }
    if (mode.kind === 'latency' && mode.ms < 0) add('fault', `faults.${route}`, '延迟不能是负数');
    if (mode.kind === 'adapter-error' && mode.error === '') add('fault', `faults.${route}`, '适配器故障缺原因');
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}
