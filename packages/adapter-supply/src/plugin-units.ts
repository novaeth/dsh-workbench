import type { DshToolDefinition, DshToolRegistry } from '@dsh-workbench/shared';
import type { UnitManifest } from '@dsh-workbench/shared';
import type { UnitOwnedFace, UnitMountResult } from '@dsh-workbench/shared/host';
import { PROBE_TTL_MS, TEXT_OUTPUT, jsonText, sessionWorkspace, unitTitleKey } from '@dsh-workbench/shared/host';
import type { Opencli } from '@dsh-workbench/adapter-runtime';
import type { PluginCatalog, PluginCommand, PluginCommandSet } from './plugin-catalog.js';
import { pluginLoginHint } from './plugin-login-hint.js';
import {
  PLUGIN_PROMPT_BUDGET,
  RUN_CODE_TOOL,
  pluginApprovalFor,
  pluginPromptChars,
  pluginToolArgv,
  pluginToolDescription,
  pluginToolName,
  pluginToolParameters,
  pluginToolSession,
  pluginToolWrites,
} from './plugin-tools.js';
import type { UnitRegistry } from './unit-registry-types.js';

export interface PluginRowRef {
  readonly id: string;
  readonly pkg: string;
  readonly name?: string | undefined;
}

export interface PluginRowsSource {
  listPlugins(workspace: string | null): readonly PluginRowRef[];
  subscribe?(listener: () => void): () => void;
}

export interface PluginUnitRow {
  readonly plugin: string;
  readonly pkg: string;
  readonly version: string;
  readonly commands: number;
  readonly synthesized: number;
  readonly chars: number;
  readonly tools: readonly string[];
}

export interface PluginUnitReport {
  readonly ok: boolean;
  readonly at: number;
  readonly plugins: readonly PluginUnitRow[];
  readonly problems: readonly string[];
}

export interface PluginUnits {
  refresh(options?: { readonly force?: boolean }): Promise<PluginUnitReport>;
  touch(): void;
  report(): PluginUnitReport;
  dispose(): void;
}

export interface PluginUnitsOptions {
  readonly registry: UnitRegistry;
  readonly catalog: PluginCatalog;
  readonly rows: () => readonly PluginRowRef[];
  readonly declared: (plugin: string) => ReadonlySet<string>;
  readonly opencliFor: (plugin: string) => Opencli;
  readonly toolNames?: () => ReadonlySet<string>;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}

interface SyntheticUnit {
  readonly id: string;
  readonly plugin: string;
  readonly pkg: string;
  readonly version: string;
  readonly signature: string;
  readonly commands: readonly PluginCommand[];
  readonly tools: readonly { readonly name: string; readonly command: PluginCommand }[];
}

interface RegisteredUnit {
  readonly signature: string;
  readonly tools: readonly string[];
  readonly drop: () => void;
}

interface PlannedTool {
  readonly name: string;
  readonly command: PluginCommand;
}

interface Plan {
  readonly units: readonly SyntheticUnit[];
  readonly rows: readonly PluginUnitRow[];
  readonly problems: readonly string[];
}

function signatureOf(version: string, commands: readonly PluginCommand[]): string {
  return [
    version,
    ...commands.map(
      (command) =>
        `${command.name}:${command.access}:${command.args
          .map((arg) => `${arg.name}${arg.required ? '!' : ''}`)
          .join('+')}`,
    ),
  ].join('|');
}

function toolsOf(
  plugin: string,
  commands: readonly PluginCommand[],
  taken: ReadonlySet<string>,
): { readonly tools: readonly PlannedTool[]; readonly problems: readonly string[] } {
  const tools: PlannedTool[] = [];
  const problems: string[] = [];
  const claimed = new Set<string>();
  for (const command of commands) {
    const name = pluginToolName(plugin, command.name);
    if (name === RUN_CODE_TOOL) {
      problems.push(
        `工具名 ${RUN_CODE_TOOL}（${plugin} ${command.name}）是 dsh 的保留名（PTC 的传送工具）—— 这条命令这次不合成`,
      );
      continue;
    }
    if (taken.has(name) || claimed.has(name)) {
      problems.push(`工具名 ${name}（${plugin} ${command.name}）已经被占着 —— 这条命令这次不合成（先来的那份说了算）`);
      continue;
    }
    claimed.add(name);
    tools.push({ name, command });
  }
  return { tools, problems };
}

function planOf(options: PluginUnitsOptions, registered: ReadonlyMap<string, RegisteredUnit>): Plan {
  const sets = new Map<string, PluginCommandSet>(
    options.catalog.snapshot().sets.map((set) => [set.plugin, set]),
  );
  const mine = new Set([...registered.values()].flatMap((item) => item.tools));
  const taken = new Set([...(options.toolNames?.() ?? [])].filter((name) => !mine.has(name)));
  const units: SyntheticUnit[] = [];
  const rows: PluginUnitRow[] = [];
  const problems: string[] = [];

  for (const row of options.rows()) {
    const plugin = row.name?.trim() ?? '';
    if (plugin === '') {
      problems.push(`面板上的插件行 ${row.id}（${row.pkg}）没有 opencli 插件名 —— 认不出它，这次不给它合成工具`);
      continue;
    }
    const set = sets.get(plugin);
    if (set === undefined) {
      problems.push(`已装插件「${plugin}」在 opencli 的插件清单 / 命令面里找不到 —— 归属不了，这次不给它合成工具`);
      continue;
    }
    sets.delete(plugin);
    const declared = options.declared(plugin);
    const overlapped = set.commands.filter((command) => declared.has(command.name));
    if (overlapped.length > 0) {
      problems.push(
        `「${plugin}」有 ${overlapped.length} 条命令由已装模块自己提供（${overlapped
          .map((command) => command.name)
          .join('、')}）—— 通用桥不重复合成`,
      );
    }
    const commands = set.commands.filter((command) => !declared.has(command.name));
    const built = toolsOf(plugin, commands, taken);
    problems.push(...built.problems);
    for (const tool of built.tools) taken.add(tool.name);
    if (built.tools.length === 0 && commands.length === set.commands.length) {
      problems.push(`「${plugin}」的命令一条都没能合成工具`);
    }
    const chars = built.tools.reduce((sum, tool) => sum + pluginPromptChars(tool.command), 0);
    if (chars > PLUGIN_PROMPT_BUDGET) {
      problems.push(
        `「${plugin}」合成出来的 ${String(built.tools.length)} 把工具，描述与参数说明合起来 ${String(
          chars,
        )} 字，超过 ${String(PLUGIN_PROMPT_BUDGET)} 字的合成面预算 —— 这些字每一步请求都跟着走，插件该精简或按工作区少开一点`,
      );
    }
    rows.push({
      plugin,
      pkg: row.pkg,
      version: set.version,
      commands: set.commands.length,
      synthesized: built.tools.length,
      chars,
      tools: built.tools.map((tool) => tool.name),
    });
    if (built.tools.length === 0) continue;
    units.push({
      id: row.id,
      plugin,
      pkg: row.pkg,
      version: set.version,
      signature: signatureOf(set.version, commands),
      commands,
      tools: built.tools,
    });
  }

  for (const set of sets.values()) {
    problems.push(
      `opencli 里装着「${set.plugin}」（${String(set.commands.length)} 条命令），但它不在插件台账里（不是从市场装的）—— 面板上没有它的开关，它的命令这次不进工具面`,
    );
  }
  return { units, rows, problems };
}

function faceOf(
  unit: SyntheticUnit,
  opencliFor: (plugin: string) => Opencli,
  note: (problem: string) => void,
): UnitOwnedFace {
  const byTool = new Map(unit.tools.map((tool) => [tool.name, tool.command]));
  const manifest: UnitManifest = {
    id: unit.id,
    title: { zh: unit.plugin, en: unit.plugin },
    titleKey: unitTitleKey(unit.id),
    card: null,
    tools: unit.tools.map((tool) => ({ name: tool.name, writes: pluginToolWrites(tool.command) })),
    host: { inject: [] },
  };

  return {
    unit: unit.id,
    manifest,
    mount(deps): UnitMountResult {
      const tools = deps.ctx.get<DshToolRegistry>('tools');
      if (tools === undefined) {
        deps.logger?.info?.(`[dsh-workbench] 没有 tools 服务，跳过 ${unit.plugin} 的命令工具注册`);
        return { routes: {}, registerTools: () => [] };
      }
      const opencli = opencliFor(unit.plugin);
      const definitions: DshToolDefinition[] = unit.tools.map((tool) => ({
        name: tool.name,
        description: pluginToolDescription(tool.command),
        parameters: pluginToolParameters(tool.command),
        output: TEXT_OUTPUT,
        async execute(raw, exec) {
          const workspace = sessionWorkspace(exec);
          try {
            const result = await opencli.json(
              [tool.command.name, ...pluginToolArgv(tool.command, raw)],
              {
                session: pluginToolSession(tool.command),
                ...(workspace === null ? {} : { workdir: workspace }),
              },
            );
            return { text: jsonText(result.value) };
          } catch (error) {
            throw new Error(pluginLoginHint(error, tool.command.domain), { cause: error });
          }
        },
      }));

      return {
        routes: {},
        factsOf: () => [],
        registerTools: () => {
          const disposers: Array<() => void> = [];
          for (const definition of definitions) {
            try {
              disposers.push(tools.register(definition));
            } catch (error) {
              note(
                `「${unit.plugin}」的 ${definition.name} 这把工具没注册上（${
                  error instanceof Error ? error.message : String(error)
                }）—— 只废这一把，同插件其余命令照常`,
              );
            }
          }
          return disposers;
        },
        needsApproval: (call) => {
          const command = call.name === undefined ? undefined : byTool.get(call.name);
          return command === undefined ? undefined : pluginApprovalFor(command)(call);
        },
      };
    },
  };
}

function reconcile(
  registered: Map<string, RegisteredUnit>,
  units: readonly SyntheticUnit[],
  options: PluginUnitsOptions,
  note: (problem: string) => void,
): void {
  const wanted = new Map(units.map((unit) => [unit.id, unit]));
  for (const [id, item] of [...registered]) {
    const next = wanted.get(id);
    if (next !== undefined && next.signature === item.signature) continue;
    item.drop();
    registered.delete(id);
  }
  for (const unit of units) {
    if (registered.has(unit.id)) continue;
    registered.set(unit.id, {
      signature: unit.signature,
      tools: unit.tools.map((tool) => tool.name),
      drop: options.registry.registerPlugin(faceOf(unit, options.opencliFor, note)),
    });
  }
}

export function createPluginUnits(options: PluginUnitsOptions): PluginUnits {
  const registered = new Map<string, RegisteredUnit>();
  const mountProblems = new Set<string>();
  let report: PluginUnitReport = { ok: false, at: 0, plugins: [], problems: ['还没探过 opencli 的插件命令面'] };
  let inflight: Promise<PluginUnitReport> | undefined;
  let lastTouch = 0;
  let warned = '';

  function note(problem: string): void {
    if (mountProblems.has(problem)) return;
    mountProblems.add(problem);
    options.logger?.warn?.(`[dsh-workbench] ${problem}`);
  }

  function snapshot(): PluginUnitReport {
    const extra = [...mountProblems];
    return extra.length === 0 ? report : { ...report, problems: [...report.problems, ...extra] };
  }

  function warn(problems: readonly string[]): void {
    const text = [...problems].sort().join('\n');
    if (text === '' || text === warned) return;
    warned = text;
    options.logger?.warn?.(`[dsh-workbench] opencli 插件命令面：\n${text}`);
  }

  async function run(force: boolean): Promise<PluginUnitReport> {
    mountProblems.clear();
    const probed = await options.catalog.refresh(force ? { force: true } : {});
    if (!probed.ok) {
      const problems = [
        ...probed.problems,
        '这次探测没成功：上面这些插件行的工具面维持在上一份（不是"这些插件没有命令"）',
      ];
      report = { ok: false, at: Date.now(), plugins: report.plugins, problems };
      warn(problems);
      return snapshot();
    }
    const plan = planOf(options, registered);
    reconcile(registered, plan.units, options, note);
    report = { ok: true, at: Date.now(), plugins: plan.rows, problems: plan.problems };
    warn(plan.problems);
    return snapshot();
  }

  function refresh(callOptions: { readonly force?: boolean } = {}): Promise<PluginUnitReport> {
    if (inflight !== undefined) return inflight;
    const task = run(callOptions.force === true).finally(() => {
      inflight = undefined;
    });
    inflight = task;
    return task;
  }

  return {
    refresh,
    touch() {
      const now = Date.now();
      if (inflight !== undefined) return;
      if (now - lastTouch < PROBE_TTL_MS) return;
      lastTouch = now;
      void refresh().catch((error: unknown) => {
        options.logger?.warn?.(`[dsh-workbench] 探 opencli 插件命令面时抛了错：${String(error)}`);
      });
    },
    report: () => snapshot(),
    dispose() {
      for (const item of registered.values()) item.drop();
      registered.clear();
    },
  };
}
