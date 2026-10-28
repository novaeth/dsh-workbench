/**
 * 一条流程：按顺序跑的步骤清单；步骤里的动作按名字从注册表取。
 */
export interface FlowDefinition {
  readonly id: string;
  readonly title: string;
  readonly target?: FlowValue | undefined;
  readonly stopWhen?: FlowPredicate | undefined;
  readonly steps: readonly FlowStep[];
}

/**
 * 重试：`attempts` 是额外次数，总共最多 6 次。
 */
export interface FlowRetry {
  readonly attempts: number;
  readonly delayMs?: number | undefined;
}

/**
 * 轮询：每次调动作，`until` 判停；`maxMs: 0` 表示不限时。
 * `onTimeout: 'continue'` 把 `undefined` 写进步骤结果，交给后面的 `when` 决定。
 */
export interface FlowPoll {
  readonly everyMs: number;
  readonly maxMs: number;
  readonly until: FlowPredicate;
  readonly onTimeout?: 'fail' | 'continue' | undefined;
}

/**
 * 逐项展开：`over` 求成数组，每项用 `item` 作用域跑一次，最多 `max` 项。
 */
export interface FlowForEach {
  readonly over: FlowValue;
  readonly as: string;
  readonly max: number;
}

/**
 * 一步：调用一个注册表里的动作，可选重试、轮询、逐项展开。
 */
export interface FlowActionStep {
  readonly id: string;
  readonly title?: string | undefined;
  readonly action: string;
  readonly with?: Readonly<Record<string, FlowValue>> | undefined;
  readonly when?: FlowPredicate | undefined;
  readonly retry?: FlowRetry | undefined;
  readonly poll?: FlowPoll | undefined;
  readonly forEach?: FlowForEach | undefined;
}

/**
 * 一步：跑另一条流程；`with` 求出来的对象就是子流程的 `in`，结果挂在 `steps.<id>` 下。
 */
export interface FlowSubFlowStep {
  readonly id: string;
  readonly title?: string | undefined;
  readonly flow: FlowDefinition;
  readonly with?: Readonly<Record<string, FlowValue>> | undefined;
  readonly when?: FlowPredicate | undefined;
}

/**
 * 一步要么调动作，要么跑子流程。
 */
export type FlowStep = FlowActionStep | FlowSubFlowStep;

/**
 * 步骤入参里的一个值：字面量、引用，或二选一。
 * 引用只从 `in` / `steps` / `item` / `value` 起头；`value` 只在 `poll.until` 里。
 */
export type FlowValue =
  | { readonly $ref: string }
  | { readonly $lit: unknown }
  | { readonly $default: readonly [FlowValue, FlowValue] };

/**
 * 条件表达式：相等、包含、存在、与、非；没有算术与函数调用。
 */
export type FlowPredicate =
  | { readonly $eq: readonly [FlowValue, FlowValue] }
  | { readonly $in: readonly [FlowValue, readonly unknown[]] }
  | { readonly $exists: FlowValue }
  | { readonly $and: readonly FlowPredicate[] }
  | { readonly $not: FlowPredicate };

/**
 * 求值现场：流程输入、已经跑完的步骤输出、当前 `forEach` 项、当前 `poll` 返回值。
 */
export interface FlowScope {
  readonly in: unknown;
  readonly steps: Readonly<Record<string, unknown>>;
  readonly item?: unknown;
  readonly value?: unknown;
}

/**
 * 动作执行时拿到的现场：取消信号、这次跑的 id 与工作区、当前步骤 id、一行进度、登录提示。
 */
export interface FlowActionContext {
  readonly signal: AbortSignal;
  readonly runId: string;
  readonly workspace: string;
  readonly stepId: string;
  log(text: string): void;
  login(url: string): void;
}

/**
 * 动作的可选元数据：给人看的标题、入参形状、以及“会不会改平台”。
 * `writes` 只给外层审批用，不参与执行。
 */
export interface FlowActionMeta {
  readonly title?: string | undefined;
  readonly description?: string | undefined;
  readonly input?: Readonly<Record<string, unknown>> | undefined;
  readonly writes?: boolean | undefined;
}

/**
 * 一个动作：实现完全自由，引擎只按名字调它。
 */
export type FlowAction = (input: unknown, context: FlowActionContext) => Promise<unknown>;

/**
 * 注册表里的一格：名字、实现、元数据。
 */
export interface RegisteredFlowAction {
  readonly name: string;
  readonly action: FlowAction;
  readonly meta: FlowActionMeta;
}

/**
 * 动作注册表：流程只能引用这里登记过的名字。
 */
export interface FlowActionRegistry {
  register(name: string, action: FlowAction, meta?: FlowActionMeta): void;
  get(name: string): RegisteredFlowAction | undefined;
  has(name: string): boolean;
  list(): readonly RegisteredFlowAction[];
}

/**
 * 步骤事件：开始、成功、跳过、失败、需要登录；重试时带第几次。
 */
export interface FlowStepEvent {
  readonly stepId: string;
  readonly title: string;
  readonly status: 'running' | 'ok' | 'skipped' | 'failed' | 'needs-login';
  readonly attempt?: number | undefined;
  readonly message?: string | undefined;
  readonly loginUrl?: string | undefined;
}

/**
 * 跑一条流程要的那几件：流程、输入、动作表、取消信号、身份与进度回调。
 * `sleep` / `now` 可注入，测试里用假时钟。
 */
export interface FlowRunOptions {
  readonly flow: FlowDefinition;
  readonly input: unknown;
  readonly actions: FlowActionRegistry;
  readonly signal: AbortSignal;
  readonly runId: string;
  readonly workspace: string;
  readonly onStep: (event: FlowStepEvent) => void;
  readonly sleep?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined;
  readonly now?: (() => number) | undefined;
}

/**
 * 一次跑的结果：成功、失败或停止；停止不是失败。
 */
export interface FlowResult {
  readonly status: 'ok' | 'failed' | 'stopped';
  readonly target: string;
  readonly steps: Readonly<Record<string, unknown>>;
  readonly failedStep?: string | undefined;
  readonly error?: unknown;
}

/**
 * 一条校验问题：指到具体路径，给 agent 或人直接改。
 */
export interface FlowProblem {
  readonly path: string;
  readonly problem: string;
}

/**
 * 校验结果：`ok` 为真表示没有 problems。
 */
export interface FlowCheck {
  readonly ok: boolean;
  readonly problems: readonly FlowProblem[];
}
