import type { DshShell } from '@dsh-workbench/shared';
import { OPENCLI_TIMEOUT_MS, parseJsonLoose, runShell } from '@dsh-workbench/shared/host';

export interface PluginCommandArg {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly positional: boolean;
  readonly valueRequired: boolean;
  readonly choices: readonly string[];
  readonly defaultValue?: unknown;
  readonly help: string;
}

export interface PluginCommand {
  readonly plugin: string;
  readonly name: string;
  readonly description: string;
  readonly access: string;
  readonly browser: boolean;
  readonly siteSession: string;
  readonly domain?: string;
  readonly args: readonly PluginCommandArg[];
}

export interface PluginCommandSet {
  readonly plugin: string;
  readonly version: string;
  readonly commands: readonly PluginCommand[];
}

export interface PluginRow {
  readonly name: string;
  readonly version: string;
  readonly commands: readonly string[];
}

export interface CommandRow {
  readonly site: string;
  readonly name: string;
  readonly description: string;
  readonly access: string;
  readonly browser: boolean;
  readonly siteSession: string;
  readonly domain?: string;
  readonly args: readonly PluginCommandArg[];
}

export interface PluginCatalogSnapshot {
  readonly ok: boolean;
  readonly at: number;
  readonly sets: readonly PluginCommandSet[];
  readonly problems: readonly string[];
}

export interface PluginCatalog {
  refresh(options?: { readonly force?: boolean }): Promise<PluginCatalogSnapshot>;
  snapshot(): PluginCatalogSnapshot;
}

export interface PluginCatalogOptions {
  readonly shell?: DshShell | undefined;
  readonly command: string;
  readonly timeoutMs?: number;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function argsOf(raw: unknown): PluginCommandArg[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const record = recordOf(item);
    if (record === undefined) return [];
    const name = textOf(record['name']).trim();
    if (name === '') return [];
    const fallback = record['default'];
    return [
      {
        name,
        type: textOf(record['type']) || 'string',
        required: record['required'] === true,
        positional: record['positional'] === true,
        valueRequired: record['valueRequired'] === true,
        choices: stringsOf(record['choices']),
        ...(fallback === undefined || fallback === null ? {} : { defaultValue: fallback }),
        help: textOf(record['help']),
      },
    ];
  });
}

export function parsePluginRows(stdout: string): PluginRow[] | undefined {
  const parsed = parseJsonLoose(stdout);
  if (!Array.isArray(parsed)) return undefined;
  const rows: PluginRow[] = [];
  for (const item of parsed) {
    const record = recordOf(item);
    if (record === undefined) return undefined;
    const name = textOf(record['name']).trim();
    if (name === '') return undefined;
    rows.push({ name, version: textOf(record['version']), commands: stringsOf(record['commands']) });
  }
  return rows;
}

export function parseCommandRows(stdout: string): CommandRow[] | undefined {
  const parsed = parseJsonLoose(stdout);
  if (!Array.isArray(parsed)) return undefined;
  const rows: CommandRow[] = [];
  for (const item of parsed) {
    const record = recordOf(item);
    if (record === undefined) return undefined;
    const site = textOf(record['site']).trim();
    const name = textOf(record['name']).trim();
    if (site === '' || name === '') return undefined;
    rows.push({
      site,
      name,
      description: textOf(record['description']),
      access: textOf(record['access']),
      browser: record['browser'] === true,
      siteSession: textOf(record['siteSession']),
      ...(textOf(record['domain']) === '' ? {} : { domain: textOf(record['domain']) }),
      args: argsOf(record['args']),
    });
  }
  return rows;
}

function commandOf(plugin: string, row: CommandRow): PluginCommand {
  return {
    plugin,
    name: row.name,
    description: row.description,
    access: row.access,
    browser: row.browser,
    siteSession: row.siteSession,
    ...(row.domain === undefined ? {} : { domain: row.domain }),
    args: row.args,
  };
}

export function attributeCommands(
  plugins: readonly PluginRow[],
  rows: readonly CommandRow[],
): { readonly sets: PluginCommandSet[]; readonly problems: string[] } {
  const bySite = new Map<string, Map<string, CommandRow>>();
  for (const row of rows) {
    const site = bySite.get(row.site) ?? new Map<string, CommandRow>();
    site.set(row.name, row);
    bySite.set(row.site, site);
  }

  const sets: PluginCommandSet[] = [];
  const problems: string[] = [];
  if (plugins.length > 0 && rows.length === 0) {
    problems.push(
      `opencli 报了 ${String(plugins.length)} 个插件，但命令面（opencli list -f json）里一条命令都没有 —— 两份清单对不上`,
    );
  }

  for (const plugin of plugins) {
    const found = bySite.get(plugin.name) ?? new Map<string, CommandRow>();
    if (found.size === 0) {
      problems.push(
        `「${plugin.name}」在 opencli 插件清单里，但命令面里没有一条 site=${plugin.name} 的命令 —— 归属不了，它这次不合成工具`,
      );
      continue;
    }
    const declared = plugin.commands.length > 0 ? plugin.commands : [...found.keys()];
    const missing = declared.filter((name) => !found.has(name));
    if (missing.length > 0) {
      problems.push(
        `「${plugin.name}」自己的清单里有 ${String(missing.length)} 条命令在命令面里找不到：${missing.join('、')}（插件版本旧或命令面没更新）`,
      );
    }
    const commands = declared.flatMap((name) => {
      const row = found.get(name);
      return row === undefined ? [] : [commandOf(plugin.name, row)];
    });
    if (commands.length === 0) {
      problems.push(`「${plugin.name}」没有任何一条能归属的命令 —— 它这次不合成工具`);
      continue;
    }
    sets.push({ plugin: plugin.name, version: plugin.version, commands });
  }

  return { sets, problems };
}

function fingerprintOf(plugins: readonly PluginRow[]): string {
  return plugins
    .map((plugin) => `${plugin.name}@${plugin.version}:${[...plugin.commands].sort().join(',')}`)
    .sort()
    .join('|');
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createPluginCatalog(options: PluginCatalogOptions): PluginCatalog {
  const timeoutMs = options.timeoutMs ?? OPENCLI_TIMEOUT_MS;
  let current: PluginCatalogSnapshot = {
    ok: false,
    at: 0,
    sets: [],
    problems: ['还没探过 opencli 的插件命令面'],
  };
  let heavy: { readonly fingerprint: string; readonly sets: readonly PluginCommandSet[]; readonly problems: readonly string[] } | undefined;

  async function read(line: string): Promise<{ readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly problem: string }> {
    const shell = options.shell;
    if (shell === undefined) {
      return { ok: false, problem: '没有执行缝（shell 服务不可用），探不了这个命令面' };
    }
    try {
      const result = await runShell(shell, line, { timeoutMs });
      if (result.timedOut) return { ok: false, problem: `${line} 超过 ${String(Math.round(timeoutMs / 1000))} 秒没返回` };
      if (result.exitCode !== 0) {
        const tail = result.stderr.trim() || result.stdout.trim();
        return { ok: false, problem: `${line} 退出码 ${String(result.exitCode)}${tail === '' ? '' : `：${tail.split('\n').slice(-3).join(' ')}`}` };
      }
      return { ok: true, stdout: result.stdout };
    } catch (error) {
      return { ok: false, problem: `${line} 没跑起来：${messageOf(error)}` };
    }
  }

  function fail(problem: string): PluginCatalogSnapshot {
    current = { ok: false, at: Date.now(), sets: current.sets, problems: [problem] };
    return current;
  }

  async function refresh(callOptions: { readonly force?: boolean } = {}): Promise<PluginCatalogSnapshot> {
    const pluginsRun = await read(`${options.command} plugin list -f json`);
    if (!pluginsRun.ok) return fail(pluginsRun.problem);
    const plugins = parsePluginRows(pluginsRun.stdout);
    if (plugins === undefined) {
      return fail('opencli plugin list -f json 的输出读不懂（不是带 name 的 JSON 数组）');
    }

    const fingerprint = fingerprintOf(plugins);
    if (!callOptions.force && heavy !== undefined && heavy.fingerprint === fingerprint) {
      current = { ok: true, at: Date.now(), sets: heavy.sets, problems: heavy.problems };
      return current;
    }

    const commandsRun = await read(`${options.command} list -f json`);
    if (!commandsRun.ok) return fail(commandsRun.problem);
    const rows = parseCommandRows(commandsRun.stdout);
    if (rows === undefined) {
      return fail('opencli list -f json 的输出读不懂（不是带 site / name 的 JSON 数组）');
    }

    const attributed = attributeCommands(plugins, rows);
    heavy = { fingerprint, sets: attributed.sets, problems: attributed.problems };
    current = { ok: true, at: Date.now(), sets: attributed.sets, problems: attributed.problems };
    return current;
  }

  return { refresh, snapshot: () => current };
}
