import type { ReactNode } from 'react';
import type { SessionsSnapshot, Translate, WorkspaceSnapshot, WorkspaceView } from '../api/dsh-client.js';
import type { UnitManifest } from '../api/unit.js';
import type { CapabilityPayload } from '../api/workbench-contract.js';
import type { Dictionaries } from '../i18n/index.js';

/**
 * 面板要跳去的一格：只用 `kind` 说去哪，具体负载由各 unit 自己约定。
 */
export interface PanelStep {
  readonly kind: string;
}

/**
 * 交给面板渲染的宿主世界：工作区与会话快照、装着的 unit、面板开关、能力表与当前选中。
 */
export interface SuiteWorld {
  readonly workspaces: WorkspaceSnapshot;
  readonly sessions: SessionsSnapshot;
  readonly manifests: readonly UnitManifest[];
  readonly panelConfig: { readonly shown: Readonly<Record<string, boolean>> } | null;
  readonly capabilities: Readonly<Record<string, CapabilityPayload>> | null;
  readonly current: {
    readonly sessionId: string | null;
    readonly workspace: WorkspaceView | null;
  };
}

/**
 * 面板视图的统一 prop：一份世界快照 + 刷新令牌 + 四个通知回调 + 翻译函数。
 */
export interface BoardModuleProps {
  readonly world: SuiteWorld;
  readonly refreshToken: number;
  readonly onRefresh: () => void;
  readonly onNavigate: (step: PanelStep) => void;
  readonly onOpenMarket: () => void;
  readonly onSummary: (summary: ModuleSummary) => void;
  readonly t: Translate;
}

/**
 * 一张卡报给宿主的摘要：此刻在不在刷新、上次读到是哪个时刻。
 */
export interface ModuleSummary {
  readonly refreshing: boolean;
  readonly at: number | null;
}

/**
 * unit 的一个子步骤：标题文案键 + 渲染这件视图的组件。
 */
export interface UnitStep {
  readonly titleKey: string;
  readonly View: (props: BoardModuleProps) => ReactNode;
}

/**
 * 一个面板单元的注册面：id、标题键、排序、视图，可带一组子步骤。
 */
export interface BoardModule {
  readonly id: string;
  readonly titleKey: string;
  readonly order: number;
  readonly View: (props: BoardModuleProps) => ReactNode;
  readonly steps?: Readonly<Record<string, UnitStep>>;
}

/**
 * 模块在浏览器侧交出来的那份面：卡片、子步骤、自己的字典，以及审批渲染。
 */
export interface UnitClientFace {
  readonly unit: string;
  readonly card?: (props: BoardModuleProps) => ReactNode;
  readonly steps?: Readonly<Record<string, UnitStep>>;
  readonly messages?: Dictionaries;
  readonly approval?:
    | {
        readonly tools: readonly string[];
        readonly render: (props: { readonly input: ApprovalInput; readonly t: Translate }) => ReactNode;
      }
    | undefined;
}

/**
 * 带着自己 manifest 的模块面（外壳按 unit 认领时用）。
 */
export interface UnitOwnedClientFace extends UnitClientFace {
  readonly manifest: UnitManifest;
}

/**
 * 一次审批要看的输入：工具名，与它这次收到的参数。
 */
export interface ApprovalInput {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/**
 * 模块注册进外壳的那个口：注册一份面（拿回注销函数）、列出已装 unit。
 */
export interface UnitClientApi {
  registerUnit(face: UnitClientFace): () => void;
  manifests(): readonly UnitManifest[];
}
