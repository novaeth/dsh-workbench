import type { HostContext } from '../../contract/module-context.js';
import type { UnitManifest } from '../../contract/unit.js';
import type { Need } from '../../contract/needs.js';
import type { RouteTable } from '../runtime/http.js';
import type { LongTaskBase, LongTaskRegistry } from './long-task.js';
import type { LongTaskHost } from './long-task-host.js';
import type { ProvisionHandler } from '../supply/provision.js';
import type { UnitCapability } from '../../contract/unit-capability.js';
import type { ApprovalCall, ApprovalFacts, ApprovalPolicy } from './tool-approval.js';
import type { ValueHandoff } from './value-handoff.js';
import type { WorkspaceStore } from '../runtime/workspace-store.js';
import type { DataReader } from '../../contract/data.js';
import type { LibReader } from '../../contract/lib.js';
import type { GitReader } from '../../contract/git.js';
import type { CommandReader } from '../../contract/command.js';
import type { HostKit } from './host-kit.js';

export interface ToolScopeContext {
  readonly workspace: string | null;
  readonly preset: string | null;
  readonly session: string | null;
  readonly scope?: unknown;
}

/**
 * mount(deps) 拿到的工作台依赖：清单、上下文、数据、执行缝、存储、长任务与供给。
 * 可选成员缺省表示这份运行时不提供该能力。
 */
export interface UnitMountDeps extends HostKit {
  /** 当前单元清单。 */
  readonly manifest: UnitManifest;
  /** 工作台上下文：取服务、登记生命周期。 */
  readonly ctx: HostContext;
  /** 工作台日志口；没有就不记。 */
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  /** 读当前安装的其它单元清单。 */
  readonly manifests: () => readonly UnitManifest[];
  /** 读当前模块拥有的单元 id。 */
  readonly ownedUnits: () => readonly string[];
  /** 可安装单元 id；没有这个能力时 undefined。 */
  readonly installable?: (() => readonly string[]) | undefined;
  /** 站点数据读取：request / plan / submitPlan。 */
  readonly data: DataReader;
  /** 工作台编排出的只读环境变量；不要直接改。 */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** 共用依赖读取；没有时 undefined。 */
  readonly libs?: LibReader | undefined;
  /** 受控 git 读取；没有时 undefined。 */
  readonly git?: GitReader | undefined;
  /** argv 命令执行；没有时 undefined。 */
  readonly commands?: CommandReader | undefined;
  /** 按工作区持久化状态。 */
  readonly store: WorkspaceStore;
  /** 跨单元值交接；没有时 undefined。 */
  readonly values?: ValueHandoff | undefined;
  /** 探测单元能力；force 绕过缓存。 */
  readonly probe?: (
    unit: string,
    options?: { readonly force?: boolean; readonly needs?: readonly Need[] },
  ) => Promise<UnitCapability | undefined>;
  /** 长任务入口；没有时 undefined。 */
  readonly longTasks?: LongTaskHost | undefined;
  /** 读当前长任务运行表；没有时 undefined。 */
  readonly longTaskRuns?: (() => ReadonlyMap<string, LongTaskRegistry<LongTaskBase>>) | undefined;
}

export type ContextRenderer = (ref: {
  readonly kind: string;
  readonly parts: readonly string[];
}) => Promise<string> | string;

export type UnitWarmRead = readonly string[];

export interface UnitCall {
  readonly source: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly result: unknown;
}

/**
 * 挂载结果：路由表 + 工具注册。
 * `registerTools()` 是**调用时才注册**，返回一组清理函数（卸载 / 热换时外壳逐个调）；
 * 工具名必须与清单 `dsh.workbench.tools` 一字不差，没有工具就 `() => []`。
 */
export interface UnitMountResult {
  readonly routes: RouteTable;
  registerTools(): Array<() => void>;
  readonly factsOf?: ((call: UnitCall) => readonly string[] | undefined) | undefined;
  readonly gate?: {
    deniedTools(context: ToolScopeContext): readonly string[];
    denyReason?(name: string, context: ToolScopeContext): string | undefined;
    subscribe(listener: () => void): () => void;
  };
  readonly context?: {
    readonly kinds: readonly string[];
    render(ref: { readonly kind: string; readonly parts: readonly string[] }): Promise<string> | string;
  };

  readonly warmReads?: (() => readonly UnitWarmRead[]) | undefined;

  readonly prefs?: { readonly resource: string; handle(payload: unknown): unknown };
  readonly actions?: readonly { readonly resource: string; handle(payload: unknown): unknown }[];
  readonly provision?: ProvisionHandler;
  readonly longTasks?: LongTaskRegistry<LongTaskBase> | undefined;
  readonly approvalDetail?:
    | ((call: ApprovalCall) => ApprovalFacts | undefined | Promise<ApprovalFacts | undefined>)
    | undefined;
  readonly needsApproval?: ApprovalPolicy | undefined;
}

export interface UnitModuleFace {
  readonly unit: string;
  mount(deps: UnitMountDeps): UnitMountResult;
}

export interface UnitOwnedFace extends UnitModuleFace {
  readonly manifest: UnitManifest;
}
