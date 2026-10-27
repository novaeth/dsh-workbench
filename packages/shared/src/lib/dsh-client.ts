import type { ReactNode } from 'react';

/**
 * 左栏一行的来源：dsh workspaces.list 快照里的一项，两个时间戳都是毫秒。
 */
export interface WorkspaceView {
  readonly workspaceId: string;
  readonly path: string;
  readonly title: string;
  readonly sessionIds: readonly string[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/**
 * workspaces.list 的整份快照：可见工作区，加上归档与置顶的会话 id；外壳只读不改。
 */
export interface WorkspaceSnapshot {
  readonly items: readonly WorkspaceView[];
  readonly archivedSessionIds: readonly string[];
  readonly pinnedSessionIds: readonly string[];
}

/**
 * 会话一行的来源（标题、空会话、在跑与否、被谁留住）；retainedBy 按视图名记留住它的份数，mainView 大于 0 即正被主视图占着。
 * projectionValues 是 dsh 的会话投影，外壳只读 `agentPreset` 一位（没选过模式时没有这一位）。
 */
export interface SessionSummary {
  readonly id: string;
  readonly displayTitle: string;
  readonly blank: boolean;
  readonly running: boolean;
  readonly updatedAt: number;
  readonly origin?: string;
  readonly retainedBy: Readonly<Partial<Record<string, number>>>;
  readonly projectionValues?: Readonly<Record<string, unknown>>;
}

/**
 * 会话投影里的一条子代理目录项；外壳只认 id，其余字段随 dsh 变。
 */
export interface SubagentCatalogEntry {
  readonly id: string;
}

/**
 * dsh sessions.list 的快照：按 id 找会话，投影里可能挂着一串子代理目录。
 */
export interface SessionsSnapshot {
  readonly byId: Readonly<Record<string, SessionSummary>>;
  readonly projectionsBySession: Readonly<
    Record<string, { values?: { subagentCatalog?: readonly SubagentCatalogEntry[] } } | undefined>
  >;
}

/**
 * 一个会话的三个状态位（在跑 / 有未读完成 / 等着用户交互）；字段缺省就是这一位不知道。
 */
export interface SessionStatus {
  readonly running?: boolean;
  readonly completionUnread?: boolean;
  readonly pendingInteraction?: { readonly kind?: string };
}

/**
 * 会话 id 到状态位的只读表；查不到的 id 就是没有这一条状态。
 */
export type SessionStatusSnapshot = ReadonlyMap<string, SessionStatus>;

/**
 * dsh layout 的面板选择位；activePanelId 为 null 表示用户把面板关了。
 */
export interface PanelInfo {
  readonly activePanelId: string | null;
}

/**
 * 某个插槽上注册着的一项（id、顺序、文案）；label 允许是函数，因为文案要跟语言走。
 */
export interface PanelEntry {
  readonly id: string;
  readonly order: number;
  readonly label: string | (() => string);
}

/**
 * 选择器 hook 的形状（dsh 那套 useSyncExternalStore）：外壳拿它从快照里取一小块并在变更时重取。
 */
export type SnapshotSelectorHook<T> = <R>(selector: (state: T) => R) => R;

/**
 * 渲染 dsh 某个插槽的函数；key 定插槽，fallback 是空槽兜底，only 用来只渲染其中一个注册项。
 */
export type RenderSlot = (
  key: string,
  owner?: Record<string, unknown>,
  options?: { fallback?: ReactNode; hookContext?: unknown; only?: string },
) => ReactNode;

/**
 * 文案函数：给键（可带参数）回一句当前语言的文本；缺键时由 dsh 决定回什么，调用点不兜。
 */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * 往 dsh 插槽注册一项要给的参数；priority 与 order 小者靠前，inject 声明这一项要用到的作用域。
 */
export interface SlotRegisterOptions {
  name: string;
  priority?: number;
  key?: string;
  id?: string;
  order?: number;
  locale?: string;
  label?: string | (() => string);
  children?: Record<string, unknown>;
  inject?: (scope?: unknown) => Record<string, unknown>;
}

/**
 * dsh 的插槽服务：注册一项、注入作用域、订阅变更，以及按名取已注册项。
 */
export interface DshSlots {
  inject(name: string, callback: () => void | (() => void) | Iterable<() => void>): () => void;
  register(options: SlotRegisterOptions, component: unknown): () => void;
  entriesOfSlot(name: string): Array<{ options: SlotRegisterOptions }>;
  subscribe(name: string, callback: () => void): () => void;
  specDynamic?(name: string): unknown;
  onMutate?(callback: (name: string) => void): () => void;
}

/**
 * dsh 的语言服务：按命名空间注册字典，再取回那个命名空间的文案函数；
 * `resolveText` 按当前语言取一份字面量（字符串原样返回，映射按语言回退链取）。
 */
export interface DshLocale {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void;
  bind(namespace: string): Translate;
  resolveText?(text: string | Readonly<Record<string, string | undefined>>): string;
}

/**
 * dsh 的布局服务：选面板、开关左栏、开合右栏；右栏宽度经可选的 panels 写。
 */
export interface DshLayout {
  selectPanel(panelId: string | null): void;
  toggleSidebar(): void;
  openRightbar(track: boolean, fullscreen: boolean): void;
  closeRightbar(): void;
  readonly panels?: DshLayoutPanels;
}

/**
 * layout 上那个可选的右栏宽度写口；dsh 没给这一位时右栏宽度就只是内存态。
 */
export interface DshLayoutPanels {
  setRightbar?(px: number): void;
}

/**
 * 快捷键目录的口子；外壳只把它透出去，形状与内容随 dsh。
 */
export interface DshShortcutCatalog {
  readonly catalog: unknown;
}

/**
 * 起一个新会话时能带的选项；目前只有 agent 预设这一项。
 */
export interface DshSessionStartOptions {
  readonly agentPreset?: string;
}

/**
 * dsh 的工作区与会话动作：开工作区、开会话、起会话、挑目录。
 */
export interface DshUiWorkspace {
  openWorkspace(workspaceId: string): Promise<unknown>;
  openSession(sessionId: string): void;
  startSession(workspaceId: string, options?: DshSessionStartOptions): void;
  pickDirectory(): Promise<string | null>;
}

/**
 * 工作区写口回的那点事实（新 id 或新标题）；字段都可能缺，缺了按「没写回」算。
 */
export interface DshWorkspaceWritten {
  readonly workspaceId?: string;
  readonly title?: string;
}

/**
 * dsh 的工作区服务：list 是可订阅快照，create 与 rename 是写口。
 */
export interface DshWorkspaces {
  readonly list: DshObservable<WorkspaceSnapshot>;
  create(request: { path: string }): Promise<DshWorkspaceWritten | undefined>;
  rename(workspaceId: string, title: string): Promise<DshWorkspaceWritten>;
}

/**
 * 往输入框插一条引用时要给的载荷：来源、引用文本、显示文案与剪贴板文本。
 */
export interface DshReferenceInsert {
  readonly source: string;
  readonly ref: string;
  readonly label: string;
  readonly appearance?: 'session' | 'file' | 'folder';
  readonly clipboardText: string;
}

/**
 * 输入框里一段 token 的区间；draftRev 用来确认还是同一版草稿，插入引用时用它定位。
 */
export interface DshTokenSpan {
  readonly start: number;
  readonly end: number;
  readonly draftRev: number;
}

/**
 * 某一个会话的输入框句柄；外壳借它插引用与弹提示，state 用来核对草稿版本。
 */
export interface DshSessionInput {
  caretSpan?: () => { start: number; end: number };
  readonly state: { getSnapshot(): { draftRev: number } | undefined };
  insertReference(ref: DshReferenceInsert, span: DshTokenSpan): boolean;
  notify(level: 'info' | 'error', text: string): void;
}

/**
 * 注册 @ 触发源的口子：候选由外壳现取，选中后的动作也归外壳，dsh 只负责触发。
 */
export interface DshInputTriggers {
  registerSource(source: {
    readonly trigger: '@';
    readonly name: string;
    readonly order?: number;
    candidates: () => Promise<readonly unknown[]>;
    onPick: () => undefined;
    lexicon?: (session: unknown) => readonly string[] | undefined;
    subscribeLexicon?: (session: unknown, listener: () => void) => () => void;
    readonly codec?: {
      clipboardText(ref: string): string;
      serialize(ref: string, signal?: AbortSignal): Promise<string>;
    };
  }): () => void;
}

/**
 * dsh 的对话服务；外壳只用它按会话取输入框句柄。
 */
export interface DshConversationService {
  readonly input: { for(actx: unknown): DshSessionInput };
}

/**
 * 浏览器侧的会话服务：快照加按 id 取作用域；create 是可选写口，不是每个 dsh 版本都有。
 */
export interface DshSessionsService {
  readonly list: {
    getSnapshot(): SessionsSnapshot;
    subscribe?(listener: () => void): () => void;
  };
  scope(sessionId: string): unknown | undefined;
  create?(request: {
    readonly workspaceId?: string;
    readonly sessionId?: string;
    readonly cwd?: string;
    readonly agentPreset?: string;
  }): Promise<unknown>;
}

/**
 * dsh 侧最小的可订阅值：取当前快照加订阅变更，外壳用它接进 React。
 */
export interface DshObservable<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}

/**
 * dsh 的右栏服务：mounted 是在场与否的可订阅值，展开与开资源另走方法。
 */
export interface DshSidebarRight {
  readonly mounted: DshObservable<string | undefined>;
  isExpanded(): boolean;
  toggleExpanded(): void;
  openResource(address: string, options?: unknown): void;
  openTab(kind: string, options?: unknown): void;
}

/**
 * remote.sessions 写口：在宿主侧建会话并回会话 id。
 */
export interface DshSessionsRemote {
  create(request: {
    readonly workspaceId?: string;
    readonly cwd?: string;
    readonly agentPreset?: string;
  }): Promise<{ readonly sessionId: string }>;
}

/**
 * remote.agentPresets 写口：给还没开跑的会话挑模式（同一件事就是模式选择器点一下）；
 * 会话发出第一条消息后 dsh 会拒（模式已锁）。
 */
export interface DshAgentPresetsRemote {
  select(sessionId: string, presetId: string): Promise<unknown>;
}

/**
 * dsh 客户端的远端写口集合；会话与模式两家。
 */
export interface DshClientRemote {
  readonly sessions: DshSessionsRemote;
  readonly agentPresets?: DshAgentPresetsRemote;
}

/**
 * 客户端插件拿到的上下文：所有服务从它取，effect 注册的清理随插件卸载跑。
 */
export interface DshClientContext {
  get<T = unknown>(name: string): T | undefined;
  provide(name: string, value: unknown): void;
  effect(effect: () => void | (() => void), label?: string): () => void;
  readonly slots: DshSlots;
  readonly locale: DshLocale;
  readonly layout: DshLayout;
  readonly uiWorkspace: DshUiWorkspace;
  readonly workspaces: DshWorkspaces;
  readonly shortcuts: DshShortcutCatalog;
  readonly remote: DshClientRemote;
}
