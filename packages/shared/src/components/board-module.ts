import type { ReactNode } from 'react';
import type { SessionsSnapshot, Translate, WorkspaceSnapshot, WorkspaceView } from '../lib/dsh-client.js';
import type { UnitManifest } from '../contract/unit.js';
import type { CapabilityPayload } from '../contract/workbench-contract.js';
import type { Dictionaries } from '../i18n/index.js';
import type { ShellLongTaskRow } from '../contract/protocol/long-tasks.js';

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
 * 卡片 view model 的一格：读到内容，或读到了但没有内容。
 */
export type CardViewModel<Model> =
  | {
      readonly phase: 'empty';
      readonly hintKey: string;
    }
  | {
      readonly phase: 'ready';
      readonly model: Model;
    };

/**
 * schema 卡的读口：由外壳发请求，模块只负责把响应映射成 view model。
 */
export type CardViewQuery =
  | Readonly<Record<string, string | number | boolean | undefined>>
  | ((props: BoardModuleProps) => Readonly<Record<string, string | number | boolean | undefined>>);

export interface CardViewRead<Model> {
  readonly route: string;
  readonly query?: CardViewQuery | undefined;
  readonly fact?: string | undefined;
  readonly enabled?: ((props: BoardModuleProps) => boolean) | undefined;
  readonly map: (payload: unknown) => CardViewModel<Model>;
}

/**
 * schema 卡的头部动作；`labelKey` 从模块字典取。
 */
export interface CardViewActionBase {
  readonly label?: string | undefined;
  readonly labelKey?: string | undefined;
  readonly icon?: 'open' | 'chat' | 'retry' | undefined;
  readonly iconOnly?: boolean | undefined;
}

export type CardViewAction =
  | (CardViewActionBase & {
      readonly kind: 'open-url';
      readonly href: string;
    })
  | (CardViewActionBase & {
      readonly kind: 'retry';
    })
  | (CardViewActionBase & {
      readonly kind: 'chat';
      readonly title?: string | undefined;
      readonly titleKey?: string | undefined;
      readonly chip: {
        readonly kind: string;
        readonly parts: readonly string[];
        readonly label?: string | undefined;
        readonly labelKey?: string | undefined;
      };
    });

/**
 * `custom` 槽拿到的现场：与卡片同样的世界，加上外壳归一化后的模型。
 */
export interface CardViewCustomProps<Model> extends BoardModuleProps {
  readonly unit: string;
  readonly model: Model;
}

/**
 * schema 卡的一档状态色：中性 / 正常 / 警告 / 失败 / 进行中。
 */
export type CardViewTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'busy';

/**
 * `metrics` section 的一格：标签、值、可选状态点。
 */
export interface CardViewMetric {
  readonly key?: string | undefined;
  readonly label?: string | undefined;
  readonly labelKey?: string | undefined;
  readonly value: string;
  readonly tone?: CardViewTone | undefined;
  readonly percent?: number | undefined;
  readonly actions?: readonly CardViewAction[] | undefined;
}

/**
 * `rows` section 的一行：标题、补充、状态点、标题链接与行尾动作。
 */
export interface CardViewRow {
  readonly key: string;
  readonly layout?: 'row' | 'activity' | undefined;
  readonly title?: string | undefined;
  readonly titleKey?: string | undefined;
  readonly meta?: string | undefined;
  readonly at?: string | undefined;
  readonly atTone?: CardViewTone | undefined;
  readonly atTitle?: string | undefined;
  readonly tone?: CardViewTone | undefined;
  readonly href?: string | undefined;
  readonly action?:
    | {
        readonly labelKey: string;
        readonly href: string;
      }
    | undefined;
  readonly actions?: readonly CardViewAction[] | undefined;
}

/**
 * `activity` section 的一行：文案、时间、可选状态点。
 */
export interface CardViewActivity {
  readonly key: string;
  readonly text?: string | undefined;
  readonly textKey?: string | undefined;
  readonly at: string;
  readonly tone?: CardViewTone | undefined;
}

/**
 * `longTask` section 对一个 run 的覆盖：标题与行尾链接。
 * 函数返回的数组只列要画的 run；返回 `undefined` 表示这一节不覆盖、全部照画；空数组表示这一节不画。
 */
export interface CardViewLongTask {
  readonly id: string;
  readonly headline?: string | undefined;
  readonly links?:
    | readonly {
        readonly href: string;
        readonly labelKey: string;
      }[]
    | undefined;
}

/**
 * schema 卡的通用 section：模块从模型里取出外壳能画的行，外壳负责排版与状态点。
 */
export interface CardViewSections<Model> {
  order?: readonly ('rows' | 'metrics' | 'activity')[] | undefined;
  frame?: boolean | undefined;
  metrics?(model: Model, t: Translate): readonly CardViewMetric[] | undefined;
  rows?(model: Model, t: Translate): readonly CardViewRow[] | undefined;
  activity?(model: Model, t: Translate): readonly CardViewActivity[] | undefined;
  longTask?(model: Model, t: Translate): readonly CardViewLongTask[] | undefined;
}

/**
 * `settings` section 的一个候选项。
 */
export interface CardViewSettingOption {
  readonly value: string;
  readonly label?: string | undefined;
  readonly labelKey?: string | undefined;
}

/**
 * `settings` section 的一个字段：下拉或单行文本。
 */
export interface CardViewSettingLoad {
  readonly route: string;
  readonly query?: CardViewQuery | undefined;
  pick(payload: unknown): readonly CardViewSettingOption[];
}

export type CardViewSettingField<Model = unknown> =
  | {
      readonly kind: 'select';
      readonly key: string;
      readonly labelKey: string;
      readonly hintKey?: string | undefined;
      readonly options?: readonly CardViewSettingOption[] | undefined;
      optionsOf?(model: Model): readonly CardViewSettingOption[];
      readonly load?: CardViewSettingLoad | undefined;
      readonly search?: boolean | undefined;
      readonly placeholderKey?: string | undefined;
    }
  | {
      readonly kind: 'text';
      readonly key: string;
      readonly labelKey: string;
      readonly hintKey?: string | undefined;
      readonly placeholderKey?: string | undefined;
    };

/**
 * schema 卡的设置面板：字段、当前值、保存路由与三句保存文案。
 */
export interface CardViewSettings<Model> {
  readonly gearKey: string;
  readonly labelKey?: string | undefined;
  readonly titleKey: string;
  readonly fields: readonly CardViewSettingField<Model>[];
  values(model: Model): Readonly<Record<string, string>>;
  openWhen?(model: Model): boolean;
  readonly save: {
    readonly route: string;
    body(
      values: Readonly<Record<string, string>>,
      model: Model,
      props: BoardModuleProps,
    ): Record<string, unknown>;
  };
  readonly labels: {
    readonly cancelKey: string;
    readonly saveKey: string;
    readonly savingKey: string;
    readonly failedKey: string;
  };
}

/**
 * 模块交给外壳的卡片视图（v1）：读口、view model、卡头、通用 sections、设置、动作，以及一个业务自定义槽。
 * 卡框、状态、阻断、动作排法由外壳负责；模块不再写这部分 React。
 */
export interface CardView<Model = unknown> {
  readonly version: 1;
  readonly titleKey: string;
  readonly idleKey?: string | undefined;
  meta?(model: Model, t: Translate): string | undefined;
  readonly platform?:
    | {
        readonly href: string;
        readonly labelKey: string;
      }
    | undefined;
  platformOf?(model: Model): { readonly href: string; readonly labelKey: string } | undefined;
  readonly refreshMs?: number | undefined;
  readonly customBody?:
    | ((
        props: BoardModuleProps,
        frame: {
          readonly settingsOpen: boolean;
          readonly onSettingsOpenChange: (open: boolean) => void;
        },
      ) => ReactNode)
    | undefined;
  readonly settingsGearKey?: string | undefined;
  readonly customLongTask?: ((rows: readonly ShellLongTaskRow[], t: Translate) => readonly CardViewLongTask[] | undefined) | undefined;
  readonly read: CardViewRead<Model>;
  readonly sections?: CardViewSections<Model> | undefined;
  readonly settings?: CardViewSettings<Model> | undefined;
  readonly actions?: readonly CardViewAction[] | undefined;
  custom?(props: CardViewCustomProps<Model>): ReactNode;
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
  readonly view?: CardView;
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
