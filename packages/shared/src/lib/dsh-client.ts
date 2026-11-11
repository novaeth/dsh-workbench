import type {} from '@deepseek-ai/dsh-agent-preset-registry/remote';
import type {} from '@deepseek-ai/dsh-api-gateway/client';
import type {} from '@deepseek-ai/dsh-api-remote-access/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/remote';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-shortcuts/client';
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-subagent';
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { PropsRenderSlots, SlotLabel } from '@deepseek-ai/dsh-client-ui-slots';
import type { SessionInput as OfficialSessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { SessionStatus as OfficialSessionStatus } from '@deepseek-ai/dsh-client-ui-session/client';
import type { SessionSummary as OfficialSessionSummary } from '@deepseek-ai/dsh-api-session-controller/client';
import type {
  WorkspaceSnapshot as OfficialWorkspaceSnapshot,
  WorkspaceView as OfficialWorkspaceView,
} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { SubagentCatalogEntry as OfficialSubagentCatalogEntry } from '@deepseek-ai/dsh-subagent';

export type { Context as DshClientContext } from '@deepseek-ai/cordis';
export type { ChildrenDecl } from '@deepseek-ai/dsh-client-ui-slots';
export type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
export type { WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client';
export type { SessionTarget } from '@deepseek-ai/dsh-api-session-controller/client';
export type { SessionId } from '@deepseek-ai/dsh-session/types';
export type { ClientRemote as DshClientRemote } from '@deepseek-ai/dsh-api-gateway/client';
export type { IWorkspaces as DshWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client';
export type { ISessions as DshSessionsService } from '@deepseek-ai/dsh-api-session-controller/client';
export type { ObservableSnapshot as DshObservable } from '@deepseek-ai/dsh-client-store';
export type { SnapshotSelectorHook, Translate } from '@deepseek-ai/dsh-client-ui-slots';
export type { LocaleRuntime as DshLocale } from '@deepseek-ai/dsh-client-locale/client';
export type { ILayout as DshLayout, PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client';
export type { Shortcuts as DshShortcutCatalog } from '@deepseek-ai/dsh-client-shortcuts/client';
export type { SlotRegistry as DshSlots } from '@deepseek-ai/dsh-client-ui-renderer/client';
export type { UiWorkspace as DshUiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client';
export type { StartSessionOptions } from '@deepseek-ai/dsh-client-ui-workspace/client';
export type { IConversation as DshConversationService } from '@deepseek-ai/dsh-client-ui-conversation/client';
export type { ReferenceInsert as DshReferenceInsert, SessionInput } from '@deepseek-ai/dsh-client-ui-conversation/client';
export type { TokenSpan as DshTokenSpan } from '@deepseek-ai/dsh-client-ui-conversation/client';
export type { InputTriggerServiceContract as DshInputTriggers } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
export type { ISidebarRight as DshSidebarRight } from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
export type { RemoteResult as DshRemoteOutcome } from '@deepseek-ai/dsh-typert-protocol';
export type {
  ContextMenuBindings as DshContextMenuBindings,
  ContextMenuTarget as DshContextMenuTarget,
  ContextMenus as DshContextMenus,
  ContextMenuTriggerProps as DshContextMenuTriggerProps,
  MenuPoint as DshMenuPoint,
  UseContextMenu as DshUseContextMenu,
} from '@deepseek-ai/dsh-client-ui-context-menu/client';
/**
 * 会话一行的来源（标题、空会话、在跑与否、被谁留住）；id 按外壳的宽串用。
 */
export type SessionSummary = Omit<OfficialSessionSummary, 'id'> & {
  readonly id: string;
};

/**
 * 右栏宽度的写口；dsh 没给这一位时右栏宽度就只是内存态，属于外壳自己的扩展位。
 */
export type DshLayoutPanels = {
  setRightbar?(px: number): void;
};

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    workbench: string;
  }

  interface SlotMap {
    'sidebar.brand.mark': { kind: 'single'; scope: 'root' };
    'sidebar.brand.name': { kind: 'single'; scope: 'root' };
    'sidebar.toggle.badge': { kind: 'single'; scope: 'root' };
    'sidebar.panellist': { kind: 'list'; scope: 'root' };
    'sidebar.panellist.actions': { kind: 'list'; scope: 'root' };
    'sidebar.settings': { kind: 'single'; scope: 'root' };
    'sidebar.footer.action': { kind: 'list'; scope: 'root' };
    'conversation.approval.detail': { kind: 'single'; scope: 'root' };
  }
}

/**
 * 左栏一行的来源：dsh workspaces.list 快照里的一项，id 按外壳的宽串用，两个时间戳原样透传。
 */
export type WorkspaceView = Omit<
  OfficialWorkspaceView,
  'workspaceId' | 'sessionIds' | 'createdAt' | 'updatedAt'
> & {
  readonly workspaceId: string;
  readonly sessionIds: readonly string[];
  readonly createdAt: number | string;
  readonly updatedAt: number | string;
};

/**
 * workspaces.list 的整份快照：可见工作区，加上归档与置顶的会话 id；外壳只读不改。
 */
export type WorkspaceSnapshot = Pick<
  OfficialWorkspaceSnapshot,
  'archivedSessionIds' | 'pinnedSessionIds'
> & {
  readonly items: readonly WorkspaceView[];
};

/**
 * 会话投影里的一条子代理目录项；外壳只认 id，其余字段随 dsh 变。
 */
export type SubagentCatalogEntry = Pick<OfficialSubagentCatalogEntry, 'id'>;

/**
 * 一条会话投影视图；外壳只读 values.subagentCatalog 一位。
 */
export type SessionProjectionView = {
  readonly values?: {
    readonly subagentCatalog?: readonly SubagentCatalogEntry[];
  };
};

/**
 * dsh sessions.list 的快照：按 id 找会话，投影里可能挂着一串子代理目录。
 */
export type SessionsSnapshot = {
  readonly byId: Readonly<Record<string, SessionSummary>>;
  readonly projectionsBySession: Readonly<Record<string, SessionProjectionView | undefined>>;
};

/**
 * 一个会话的三个状态位；字段缺省就是这一位不知道，pendingInteraction 只认 kind。
 */
export type SessionStatus = Omit<Partial<OfficialSessionStatus>, 'pendingInteraction'> & {
  readonly pendingInteraction?: { readonly kind?: string } | undefined;
};

/**
 * 会话 id 到状态位的只读表；查不到的 id 就是没有这一条状态。
 */
export type SessionStatusSnapshot = ReadonlyMap<string, SessionStatus>;

/**
 * 某个插槽上注册着的一项（id、顺序、文案）；label 允许是函数，因为文案要跟语言走。
 */
export type PanelEntry = {
  readonly id: string;
  readonly order: number;
  readonly label: SlotLabel;
};

/**
 * 外壳渲染 dsh 插槽用的那把口；键与 owner 由官方插槽表定，选项对到官方 RenderOpts。
 */
export type RenderSlot = PropsRenderSlots<
  | 'sidebar.brand.mark'
  | 'sidebar.brand.name'
  | 'sidebar.toggle.badge'
  | 'sidebar.panellist'
  | 'sidebar.panellist.actions'
  | 'sidebar.settings'
  | 'sidebar.footer.action'
  | 'sidebar.workspaces.session.row.action'
  | 'sidebar.session.row.leading'
  | 'sidebar.session.row.hover'
>['renderSlot'];

/**
 * 往 dsh 插槽注册一项要给的参数（官方 register 的第一个位置）。
 */
export type SlotRegisterOptions = Parameters<SlotRegistry['register']>[0];

/**
 * 起一个新会话时能带的选项；外壳只带 agent 预设这一项。
 */
export type DshSessionStartOptions = Pick<
  import('@deepseek-ai/dsh-client-ui-workspace/client').StartSessionOptions,
  'agentPreset'
>;

/**
 * 工作区写口回的那点事实（新 id 或新标题）；字段都可能缺，缺了按「没写回」算。
 */
export type DshWorkspaceWritten = Pick<OfficialWorkspaceView, 'workspaceId' | 'title'>;

/**
 * dsh 远端会话写口（`remote.session`）：建会话，以及把宿主上的路径交给桌面打开。
 */
export type DshSessionsRemote = Pick<DshClientRemoteSession, 'create' | 'openWorkspacePath'>;

type DshClientRemoteSession = import('@deepseek-ai/dsh-api-gateway/client').ClientRemote['session'];

/**
 * remote.agentPresets 写口：给还没开跑的会话挑模式。
 */
export type DshAgentPresetsRemote = Pick<
  import('@deepseek-ai/dsh-api-gateway/client').ClientRemote['agentPresets'],
  'select'
>;

/**
 * 某一个会话的输入框句柄；外壳借它插引用与弹提示，caretSpan 是外壳要的额外一位。
 */
export type DshSessionInput = OfficialSessionInput & {
  caretSpan?: () => { readonly start: number; readonly end: number };
};
