import type { DshHostContext } from '../api/dsh.js';
import type { UnitManifest } from '../api/unit.js';
import type { RouteTable } from '../host/http.js';
import type { LongTaskBase, LongTaskHost, LongTaskRegistry } from '../host/long-task.js';
import type { ProvisionHandler } from '../host/provision.js';
import type { UnitCapability } from './unit-libs.js';
import type { ApprovalCall, ApprovalFacts, ApprovalPolicy } from '../host/tool-approval.js';
import type { ValueHandoff } from '../host/value-handoff.js';
import type { WorkspaceStore } from '../host/workspace-store.js';

export interface ToolScopeContext {
  readonly workspace: string | null;
  readonly preset: string | null;
}

export interface UnitMountDeps {
  readonly manifest: UnitManifest;
  readonly ctx: DshHostContext;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  readonly manifests: () => readonly UnitManifest[];
  readonly ownedUnits: () => readonly string[];
  readonly installable?: (() => readonly string[]) | undefined;
  readonly opencliCommand?: string;
  readonly store: WorkspaceStore;
  readonly values?: ValueHandoff | undefined;
  readonly probe?: (
    unit: string,
    options?: { readonly force?: boolean },
  ) => Promise<UnitCapability | undefined>;
  readonly longTasks?: LongTaskHost | undefined;
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

export interface UnitMountResult {
  readonly routes: RouteTable;
  registerTools(): Array<() => void>;
  readonly factsOf?: ((call: UnitCall) => readonly string[] | undefined) | undefined;
  readonly gate?: {
    deniedTools(context: ToolScopeContext): readonly string[];
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
