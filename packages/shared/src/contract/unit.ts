import type { ExtensionNeed, LibNeed, Need } from './needs.js';

/**
 * 模块的人类可读名字：中英各一份，写在 package.json 的 dsh.workbench.title 里。
 */
export interface UnitTitle {
  readonly zh: string;
  readonly en: string;
}

/**
 * 外壳替模块名合成的词表键：模块自己不必写名字键，名字直接从清单里的 title 注册进来。
 * @param unit 单元 id。
 * @returns 该单元名字在词表里的键。
 */
export function unitTitleKey(unit: string): string {
  return `dsh-workbench.unit.${unit}.title`;
}

/**
 * 一张卡片在清单里的静态声明：只剩排序位；显不显示由运行期面板配置定。
 */
export interface UnitCard {
  readonly order: number;
}

/**
 * 合成工具背后那条运行时命令：插件名与命令名都是运行时那边的原名，`args` 是命令自己声明的参数名（按声明顺序）。
 */
export interface UnitToolRuntime {
  readonly plugin: string;
  readonly command: string;
  readonly args: readonly string[];
}

/**
 * 一条工具在清单里的样子：全名加会不会写；审批按 writes 认领。
 * `elevates` 为真表示这次调用会抬高工具面（开工具包），审批按它认领、与写无关。
 * `runtime` 只有「按已装插件合成」的单元写，手写模块的工具没有这一格。
 */
export interface UnitTool {
  readonly name: string;
  readonly writes: boolean;
  readonly elevates?: boolean;
  readonly onDemand?: boolean;
  readonly runtime?: UnitToolRuntime;
}

/**
 * 模块要外壳的哪些服务：inject 缺一个就挂不上，optional 缺了照挂。
 * writes 声明模块要哪几档执行缝写入域：unit 是模块自己的数据目录，workspace 是当前会话工作区；
 * 缺省 [] = 不给执行缝门面（deps.seam 是 undefined）。
 */
export interface UnitHostNeeds {
  readonly inject: readonly string[];
  readonly optional?: readonly string[];
  readonly writes?: readonly ('unit' | 'workspace')[];
}

/**
 * 已装插件与源上最新版那一对，用来判该不该提示升级；latest 缺省表示还没查到。
 */
export interface PluginRelease {
  readonly installed: string;
  readonly latest?: string;
}

/**
 * 装配期用的模块清单：单元 id、名字、名字键、卡片、工具、宿主服务与环境需要，比声明少一层协议包装。
 * titleKey 恒等于 unitTitleKey(id)：有没有卡片都指向同一个词表键，展示方照它取名字。
 */
export interface UnitManifest {
  readonly id: string;
  readonly title?: UnitTitle;
  readonly titleKey: string;
  readonly card: UnitCard | null;
  readonly tools: readonly UnitTool[];
  readonly host: UnitHostNeeds;
  readonly needs?: readonly Need[];
}

/**
 * 模块声明的全部环境需要（没写就是空表）。
 * @param manifest 模块清单。
 * @returns need 列表。
 */
export function needsOf(manifest: UnitManifest): readonly Need[] {
  return manifest.needs ?? [];
}

/**
 * 宿主能代装的那些需要：只有写了 `sources` 的 extension / lib 算。
 * @param manifest 模块清单。
 * @returns 可代装的 need 列表。
 */
export function provisionableNeedsOf(manifest: UnitManifest): readonly (ExtensionNeed | LibNeed)[] {
  return needsOf(manifest).filter(
    (need): need is ExtensionNeed | LibNeed =>
      (need.kind === 'extension' || need.kind === 'lib') && (need.sources ?? []).length > 0,
  );
}

/**
 * 市场门槛要看的那些需要：声明了 extension / lib 就算（不要求写了来源）。
 * @param manifest 模块清单。
 * @returns extension / lib 的 need 列表。
 */
export function supplyNeedsOf(manifest: UnitManifest): readonly (ExtensionNeed | LibNeed)[] {
  return needsOf(manifest).filter(
    (need): need is ExtensionNeed | LibNeed => need.kind === 'extension' || need.kind === 'lib',
  );
}
