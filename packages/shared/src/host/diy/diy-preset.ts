import type { DshAgentPresetDefinition, DshLoaderEntry } from '../../api/dsh.js';
import { DIY_PRESET_ID, DIY_PRESET_SOURCE_DEFAULT } from '../../contract/protocol/diy.js';

const AGENT_PRESET_PLUGIN = '@deepseek-ai/dsh-agent-preset';

/** DIY preset 在模式菜单里的名字。 */
export const DIY_PRESET_NAME = '工作台 DIY 模式';

/** DIY preset 在模式菜单里的说明。 */
export const DIY_PRESET_DESCRIPTION =
  '查看或调整这个工作区的面板，也可以为它新建一块内容。任何工作区都能使用（空项目也可以）；agent 会查看面板、抓取请求，必要时创建模块并安装。不需要写代码。';

/** DIY preset 在模式菜单里的排序（排在 dsh 出厂的几个模式之后）。 */
export const DIY_PRESET_ORDER = 9;

/** 可以作为 DIY 来源的一个模式：它的声明、显示信息，以及这一份能不能派生。 */
export interface DiyPresetSourceRow {
  readonly id: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly order: number | null;
  readonly usable: boolean;
}

/** 这一轮 dsh 的模式无法派生时抛的错：带上哪一段锚点变了。 */
export class DiyPresetSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiyPresetSourceError';
  }
}

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function orderOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nameOf(sourceId: string): string {
  return `「${sourceId}」模式`;
}

function rowAt(value: unknown, at: string): Row {
  if (!isRow(value)) throw new DiyPresetSourceError(`${at} 不是插件配置`);
  return value;
}

function configRowsOf(entries: Iterable<DshLoaderEntry>): Row[] {
  const rows: Row[] = [];
  for (const entry of entries) {
    if (entry.disabled === true) continue;
    if (entry.options?.name !== AGENT_PRESET_PLUGIN) continue;
    const config = entry.options.config;
    if (isRow(config) && typeof config.id === 'string' && config.id !== '') rows.push(config);
  }
  return rows;
}

function sourceConfigOf(value: unknown, sourceId: string): Row {
  const source = rowAt(value, nameOf(sourceId));
  if (!Array.isArray(source.plugins)) {
    throw new DiyPresetSourceError(`${nameOf(sourceId)}没有 plugins 表，无法派生 DIY 模式`);
  }
  return source;
}

function clonedPluginsOf(source: Row, sourceId: string): Row[] {
  let cloned: unknown;
  try {
    cloned = structuredClone(source);
  } catch (error) {
    throw new DiyPresetSourceError(`无法复制${nameOf(sourceId)}的配置：${String(error)}`);
  }
  const rows = rowAt(cloned, nameOf(sourceId)).plugins;
  if (!Array.isArray(rows)) {
    throw new DiyPresetSourceError(`${nameOf(sourceId)}没有 plugins 表，无法派生 DIY 模式`);
  }
  return rows.map((row, index) => {
    const parsed = rowAt(row, `${nameOf(sourceId)}第 ${index + 1} 行`);
    if (typeof parsed.name !== 'string' || parsed.name === '') {
      throw new DiyPresetSourceError(`${nameOf(sourceId)}第 ${index + 1} 行缺少插件名`);
    }
    return parsed;
  });
}

function takeRow(plugins: Row[], id: string, sourceId: string): Row {
  const index = plugins.findIndex((row) => row.id === id);
  if (index < 0) {
    throw new DiyPresetSourceError(`${nameOf(sourceId)}里没有 \`${id}\` 行 —— DIY 的差分锚点变了`);
  }
  return plugins.splice(index, 1)[0] as Row;
}

function usableOf(plugins: unknown): boolean {
  if (!Array.isArray(plugins)) return false;
  const ids = new Set<string>();
  for (const row of plugins) {
    if (!isRow(row) || typeof row.name !== 'string' || row.name === '') return false;
    if (typeof row.id !== 'string' || row.id === '') continue;
    if (ids.has(row.id)) return false;
    ids.add(row.id);
  }
  return ids.has('skill-filesystem') && ids.has('tool-skill');
}

function sourceOrder(left: DiyPresetSourceRow, right: DiyPresetSourceRow): number {
  if (left.order !== right.order) {
    if (left.order === null) return 1;
    if (right.order === null) return -1;
    return left.order - right.order;
  }
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * 在 loader 的行里找某个显式声明过的模式；没有（或该行被关掉）就算不知道。
 * @param entries loader 的 `entries()`（递归给全部行）。
 * @param id 模式 id（dsh 声明的 `config.id`）。
 */
export function presetConfigOf(entries: Iterable<DshLoaderEntry>, id: string): unknown {
  return configRowsOf(entries).find((row) => row.id === id);
}

/**
 * 在 loader 的行里找 dsh 的 `standard` 模式；没有（或该行被关掉）就算不知道。
 * @param entries loader 的 `entries()`（递归给全部行）。
 */
export function standardPresetConfigOf(entries: Iterable<DshLoaderEntry>): unknown {
  return presetConfigOf(entries, DIY_PRESET_SOURCE_DEFAULT);
}

/**
 * 列出可以从哪些模式派生 DIY：只认显式声明、且带齐 `skill-filesystem` / `tool-skill` 两行的。
 * @param entries loader 的 `entries()`（递归给全部行）。
 */
export function diyPresetSourcesOf(entries: Iterable<DshLoaderEntry>): readonly DiyPresetSourceRow[] {
  const seen = new Set<string>();
  const rows: DiyPresetSourceRow[] = [];
  for (const config of configRowsOf(entries)) {
    const id = config.id as string;
    if (id === DIY_PRESET_ID || id === 'cordis' || seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      name: textOf(config.name),
      description: textOf(config.description),
      order: orderOf(config.order),
      usable: usableOf(config.plugins),
    });
  }
  return rows.sort(sourceOrder);
}

/**
 * 从用户选中的模式声明派生 `workbench-diy`。
 *
 * 差分只有三处：`skill-filesystem` 与 `tool-skill` 一起搬到末尾（前者加 `customSkillDirs` 指向工作台的
 * `skills/`）、末尾补 `tool-cordis`、`tool-plugin-manager` 打开（工作台只活在 profile 里）。
 * 其余行原样跟着来源模式走，所以 dsh 加工具 / 改 config 时不需要重新生成任何文件。
 * @param source 来源模式的声明（loader 中该行收到的 config）。
 * @param skillsDir 工作台的 `skills/` 绝对路径。
 * @param sourceId 来源模式的 id，报错时点名用。
 */
export function diyPresetFrom(
  source: unknown,
  skillsDir: string,
  sourceId: string = DIY_PRESET_SOURCE_DEFAULT,
  sourceName: string = sourceId,
): DshAgentPresetDefinition {
  const plugins = clonedPluginsOf(sourceConfigOf(source, sourceId), sourceId);

  const skillFilesystem = takeRow(plugins, 'skill-filesystem', sourceId);
  const toolSkill = takeRow(plugins, 'tool-skill', sourceId);
  skillFilesystem.config = {
    ...(isRow(skillFilesystem.config) ? skillFilesystem.config : {}),
    customSkillDirs: [skillsDir],
  };

  const manager = plugins.find((row) => row.id === 'tool-plugin-manager');
  if (manager !== undefined) manager.disabled = false;

  if (!plugins.some((row) => row.id === 'tool-cordis')) {
    plugins.push({ id: 'tool-cordis', name: '@deepseek-ai/dsh-tool-cordis' });
  }
  plugins.push(skillFilesystem, toolSkill);

  const seen = new Set<string>();
  for (const row of plugins) {
    if (typeof row.id !== 'string' || row.id === '') continue;
    if (seen.has(row.id)) {
      throw new DiyPresetSourceError(`${nameOf(sourceId)}里出现重复的 id：${row.id}`);
    }
    seen.add(row.id);
  }

  return {
    id: DIY_PRESET_ID,
    name: DIY_PRESET_NAME,
    description: `${DIY_PRESET_DESCRIPTION}（基于「${sourceName}」）`,
    order: DIY_PRESET_ORDER,
    plugins: plugins as unknown as DshAgentPresetDefinition['plugins'],
  };
}
