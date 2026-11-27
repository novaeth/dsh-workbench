import type { AuthLoss } from './data.js';
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
 * `runtime` 只有「按已装插件合成」的单元写，手写模块的工具没有这一格。
 */
export interface UnitTool {
  readonly name: string;
  readonly writes: boolean;
  readonly runtime?: UnitToolRuntime;
}

/**
 * 一个站点的返回信封：`dataPath` 是业务数据那一格，`codePath` / `messagePath` 是业务码与文案。
 * 只在生成期展开路径时使用，运行时不认「信封」这个概念。
 */
export interface SiteEnvelope {
  readonly dataPath?: string;
  readonly codePath?: string;
  readonly messagePath?: string;
}

/**
 * 站点级事实：模块里同一个站点只写一遍，配方与计划用 `site` 引用。
 * `origin` 必填；其余缺省时等同于今天的内联写法。`authLoss` 与读取计划共用同一形状。
 */
export interface UnitSite {
  readonly origin: string;
  readonly loginUrl?: string;
  readonly session?: string;
  readonly timeoutMs?: number;
  readonly authLoss?: AuthLoss;
  readonly envelope?: SiteEnvelope;
  readonly pagination?: {
    readonly pageParam?: string;
    readonly sizeParam?: string;
    readonly totalPath?: string;
  };
}

/**
 * 模块要外壳的哪些服务：inject 缺一个就挂不上，optional 缺了照挂。
 * origins 是模块要读写的站点（能解析的 origin）；声明了就只有这些站点放行，写 `[]` 等于一个都不许。
 * sites 是站点事实的唯一来源，写了它时 origins 由站点 origin 推导（显式 origins 仍参与并集）。
 * writes 声明模块要哪几档执行缝写入域：unit 是模块自己的数据目录，workspace 是当前会话工作区；
 * 缺省 [] = 不给执行缝门面（deps.seam 是 undefined）。
 */
export interface UnitHostNeeds {
  readonly inject: readonly string[];
  readonly optional?: readonly string[];
  readonly writes?: readonly ('unit' | 'workspace')[];
  readonly origins?: readonly string[];
  readonly sites?: Readonly<Record<string, UnitSite>>;
}

/**
 * 已装插件与源上最新版那一对，用来判该不该提示更新；latest 缺省表示还没查到。
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
  readonly skillId?: string;
  readonly title?: UnitTitle;
  readonly titleKey: string;
  readonly description?: string;
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
      (need.kind === 'extension' || need.kind === 'lib') &&
      (need.sources ?? []).some((source) => source.kind !== 'builtin'),
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
