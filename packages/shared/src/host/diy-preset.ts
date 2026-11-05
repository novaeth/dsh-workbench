import type { DshAgentPresetDefinition, DshLoaderEntry } from '../api/dsh.js';
import { DIY_PRESET_ID } from '../contract/protocol/diy.js';

const AGENT_PRESET_PLUGIN = '@deepseek-ai/dsh-agent-preset';
const STANDARD_PRESET_ID = 'standard';

/** DIY preset 在模式菜单里的名字。 */
export const DIY_PRESET_NAME = '工作台 DIY 模式';

/** DIY preset 在模式菜单里的说明。 */
export const DIY_PRESET_DESCRIPTION =
  '看 / 调这个工作区的面板，或者给它造一块新内容 —— 用大白话说就行。任何工作区都能用（空项目也算）；agent 会看面板、抓请求，必要时把模块造出来装上。不用写代码。';

/** DIY preset 在模式菜单里的排序（排在 dsh 出厂的几个模式之后）。 */
export const DIY_PRESET_ORDER = 9;

/** 这一轮 dsh 的 standard preset 没法派生时抛的错：带上哪一段锚点变了。 */
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

function rowAt(value: unknown, at: string): Row {
  if (!isRow(value)) throw new DiyPresetSourceError(`${at} 不是一行插件配置`);
  return value;
}

function standardConfigOf(value: unknown): Row {
  const standard = rowAt(value, 'dsh 的 standard preset');
  if (!Array.isArray(standard.plugins)) {
    throw new DiyPresetSourceError('dsh 的 standard preset 没有 plugins 表 —— 派生不出 DIY 那一份');
  }
  return standard;
}

function clonedPluginsOf(standard: Row): Row[] {
  let cloned: unknown;
  try {
    cloned = structuredClone(standard);
  } catch (error) {
    throw new DiyPresetSourceError(`dsh 的 standard preset 配置复制不了：${String(error)}`);
  }
  const rows = rowAt(cloned, 'dsh 的 standard preset').plugins;
  if (!Array.isArray(rows)) {
    throw new DiyPresetSourceError('dsh 的 standard preset 没有 plugins 表 —— 派生不出 DIY 那一份');
  }
  return rows.map((row, index) => {
    const parsed = rowAt(row, `dsh 的 standard preset 第 ${index + 1} 行`);
    if (typeof parsed.name !== 'string' || parsed.name === '') {
      throw new DiyPresetSourceError(`dsh 的 standard preset 第 ${index + 1} 行没有插件名`);
    }
    return parsed;
  });
}

function takeRow(plugins: Row[], id: string): Row {
  const index = plugins.findIndex((row) => row.id === id);
  if (index < 0) {
    throw new DiyPresetSourceError(`dsh 的 standard preset 里找不到 \`${id}\` 那一行 —— DIY 的差分锚点变了`);
  }
  return plugins.splice(index, 1)[0] as Row;
}

/**
 * 从这一轮 dsh 的 `standard` preset 配置派生 `workbench-diy`。
 *
 * 差分只有三处：`skill-filesystem` 与 `tool-skill` 一起搬到末尾（前者加 `customSkillDirs` 指向工作台的
 * `skills/`）、末尾补 `tool-cordis`、`tool-plugin-manager` 打开（工作台只活在 profile 里）。
 * 其余行原样跟着 dsh 走，所以 dsh 加工具 / 改 config 时不需要重新生成任何文件。
 * @param standard dsh loader 里 `preset-standard` 那一行收到的 config。
 * @param skillsDir 工作台的 `skills/` 绝对路径。
 */
export function diyPresetFrom(standard: unknown, skillsDir: string): DshAgentPresetDefinition {
  const plugins = clonedPluginsOf(standardConfigOf(standard));

  const skillFilesystem = takeRow(plugins, 'skill-filesystem');
  const toolSkill = takeRow(plugins, 'tool-skill');
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
      throw new DiyPresetSourceError(`dsh 的 standard preset 里出现重复的 id：${row.id}`);
    }
    seen.add(row.id);
  }

  return {
    id: DIY_PRESET_ID,
    name: DIY_PRESET_NAME,
    description: DIY_PRESET_DESCRIPTION,
    order: DIY_PRESET_ORDER,
    plugins,
  };
}

/**
 * 在 loader 的行里找这一轮 dsh 的 `standard` preset 配置；没有（或那一行被关掉）就算不知道。
 * @param entries loader 的 `entries()`（递归给全部行）。
 */
export function standardPresetConfigOf(entries: Iterable<DshLoaderEntry>): unknown {
  for (const entry of entries) {
    if (entry.disabled === true) continue;
    if (entry.options?.name !== AGENT_PRESET_PLUGIN) continue;
    const config = entry.options.config;
    if (isRow(config) && config.id === STANDARD_PRESET_ID) return config;
  }
  return undefined;
}
