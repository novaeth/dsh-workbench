/**
 * 一张卡片在清单里的静态声明（文案键加排序位）；默认显不显示由运行期面板配置定。
 */
export interface UnitCard {
  readonly titleKey: string;
  readonly order: number;
}

/**
 * 一条工具在清单里的样子：全名加会不会写；审批按 writes 认领。
 */
export interface UnitTool {
  readonly name: string;
  readonly writes: boolean;
}

/**
 * 模块要外壳的哪些服务：inject 缺一个就挂不上，optional 缺了照挂。
 */
export interface UnitHostNeeds {
  readonly inject: readonly string[];
  readonly optional?: readonly string[];
}

/**
 * 一个 opencli 插件的来源三选一（git / 本地 / npm）；npm 那支的安装源先看 registryEnv 那个环境变量，没设才用 registryDefault。
 */
export type PluginSource =
  | { readonly kind: 'git'; readonly url: string }
  | { readonly kind: 'local'; readonly env: string }
  | {
      readonly kind: 'npm';
      readonly package: string;
      readonly registryEnv: string;
      readonly registryDefault?: string;
    };

/**
 * 模块要的一个 opencli 插件：名字、它得提供的命令，以及装它的来源（没写就是不代装）。
 */
export interface UnitPluginNeed {
  readonly name: string;
  readonly commands?: readonly string[];
  readonly installSource?: PluginSource;
}

/**
 * 模块要的一个共用库：名字、期望范围与它为什么要这个版本（purpose 会进申报文案）。
 */
export interface UnitLibNeed {
  readonly name: string;
  readonly version?: string | undefined;
  readonly registryEnv: string;
  readonly registryDefault: string;
  readonly purpose: string;
}

/**
 * 模块的整份环境需要：一条自检命令，加上插件与共用库两张表。
 */
export interface UnitEnvNeeds {
  readonly command?: string;
  readonly plugins?: readonly UnitPluginNeed[];
  readonly libs?: readonly UnitLibNeed[];
}

/**
 * 已装插件与源上最新版那一对，用来判该不该提示升级；latest 缺省表示还没查到。
 */
export interface PluginRelease {
  readonly installed: string;
  readonly latest?: string;
}

/**
 * 装配期用的模块清单：单元 id、卡片、工具与宿主 / 环境需要，比声明少一层协议包装。
 */
export interface UnitManifest {
  readonly id: string;
  readonly card: UnitCard | null;
  readonly tools: readonly UnitTool[];
  readonly host: UnitHostNeeds;
  readonly env?: UnitEnvNeeds;
}

/**
 * 判这个模块要不要往外装东西。
 * @param manifest 模块清单。
 * @returns 插件与共用库两张表都空时给 false。
 */
export function hasEnvSupply(manifest: UnitManifest): boolean {
  return (manifest.env?.plugins ?? []).length > 0 || (manifest.env?.libs ?? []).length > 0;
}
