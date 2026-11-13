import type { LongTaskIntervention } from '../../contract/long-task.js';
import type { AiPort } from '../ai/port.js';

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
 * agent 节点要的那点东西：提示词（求成字符串）、可选的结构化输出形状，以及模型与会话的覆盖项。
 * `provider` / `model` 指的是回答这一步的模型；`preset` 是这一轮 dsh 的 agent 模式 id。
 */
export interface FlowAgentSpec {
  readonly prompt: FlowValue;
  /** 要给它看的图片（data URL / 绝对路径），求值成一个字符串数组。 */
  readonly images?: FlowValue | undefined;
  /** 工具面：只留 `allow` 里的，去掉 `deny` 里的（名字是全局工具名）。 */
  readonly tools?: { readonly allow?: readonly string[]; readonly deny?: readonly string[] } | undefined;
  readonly label?: string | undefined;
  readonly name?: string | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly preset?: string | undefined;
  readonly cwd?: FlowValue | undefined;
  readonly schema?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * 一步：让一个子 agent 读与判断。结果进 `steps.<id>`：没 `schema` 是文本，有 `schema` 是那个对象。
 * 不给 `poll` —— agent 不是可轮询的读口；要等就写在动作步骤里。
 */
export interface FlowAgentStep {
  readonly id: string;
  readonly title?: string | undefined;
  readonly agent: FlowAgentSpec;
  readonly when?: FlowPredicate | undefined;
  readonly retry?: FlowRetry | undefined;
  readonly forEach?: FlowForEach | undefined;
}

/**
 * 一步要么调动作，要么跑子流程，要么让一个子 agent 判断。
 */
/**
 * 一步：让模型给一个结论。比 agent 节点轻（不起子 agent、没有工具），只借模型的判断。
 */
export interface FlowAiSpec {
  /** 提示词，求成字符串。 */
  readonly prompt: FlowValue;
  /** 要给它看的图片，求成字符串数组（data URL 或绝对路径）。 */
  readonly images?: FlowValue | undefined;
  /** 对象根的 JSON Schema；给了就返回那个对象。 */
  readonly schema?: Readonly<Record<string, unknown>> | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly temperature?: number | undefined;
  readonly timeoutMs?: number | undefined;
}

/** 一步：让模型读与判断，不起子 agent。 */
export interface FlowAiStep {
  readonly id: string;
  readonly title?: string | undefined;
  readonly ai: FlowAiSpec;
  readonly when?: FlowPredicate | undefined;
  readonly retry?: FlowRetry | undefined;
  readonly forEach?: FlowForEach | undefined;
}

export type FlowStep = FlowActionStep | FlowSubFlowStep | FlowAgentStep | FlowAiStep;

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
 * 动作执行时拿到的现场：取消信号、这次跑的 id 与工作区、当前步骤 id、一行进度、登录与人工干预提示。
 */
export interface FlowActionContext {
  readonly signal: AbortSignal;
  readonly runId: string;
  readonly workspace: string;
  readonly stepId: string;
  log(text: string): void;
  login(url: string): void;
  need(intervention: LongTaskIntervention): void;
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
 * 步骤事件：开始、成功、跳过、失败、需要登录、需要人工处理；重试时带第几次。
 */
export interface FlowStepEvent {
  readonly stepId: string;
  readonly title: string;
  readonly status: 'running' | 'ok' | 'skipped' | 'failed' | 'needs-login' | 'needs-human';
  readonly attempt?: number | undefined;
  readonly message?: string | undefined;
  readonly loginUrl?: string | undefined;
  readonly intervention?: LongTaskIntervention | undefined;
}

/**
 * 跑一条流程要的那几件：流程、输入、动作表、取消信号、身份与进度回调。
 * `sleep` / `now` 可注入，测试里用假时钟；`sessionId` / `agentRunner` / `maxAgents` 只给 agent 节点用。
 */
export interface FlowRunOptions {
  readonly flow: FlowDefinition;
  readonly input: unknown;
  readonly actions: FlowActionRegistry;
  readonly signal: AbortSignal;
  readonly runId: string;
  readonly workspace: string;
  readonly sessionId?: string | undefined;
  readonly agentRunner?: FlowAgentRunner | undefined;
  readonly maxAgents?: number | undefined;
  readonly ai?: AiPort | undefined;
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

/**
 * 起一个子 agent 的请求：提示词、可选的模型与模式覆盖、可选的输出形状。
 * `schema` 是对象根的 JSON Schema；给了它就只认 `value`，文本只进步骤行摘要。
 */
export interface FlowAgentRequest {
  readonly stepId: string;
  readonly prompt: string;
  readonly images?: readonly string[] | undefined;
  /** 只让子 agent 看见这些工具；`deny` 优先。 */
  readonly toolFilter?: { readonly allow?: readonly string[]; readonly deny?: readonly string[] } | undefined;
  readonly label?: string | undefined;
  readonly name?: string | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly preset?: string | undefined;
  readonly cwd?: string | undefined;
  readonly schema?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * 一个子 agent 跑完的样子：最后一条非空回复的文本、可选的结构化值、子会话身份与停止原因。
 * 停止原因不在这里判失败 —— 由流程引擎把非 `completed` 翻成步骤失败。
 */
export interface FlowAgentResult {
  readonly text: string;
  readonly value?: unknown;
  readonly childId: string;
  readonly name: string;
  readonly stopReason: string;
}

/**
 * 一条流程跑起来时开的一个 agent 通道：按步骤跑子 agent，跑完收摊。
 * 同一条流程（含子流程）共用一个 runner，预算与父会话都归它。
 */
export interface FlowAgentRunner {
  run(request: FlowAgentRequest, signal: AbortSignal): Promise<FlowAgentResult>;
  dispose(): Promise<void>;
}

/**
 * 宿主给的 agent 端口：有会话就用它，没会话的按各宿主自己的办法（工作台会明确拒绝）。
 * 没有 `subagents` 的运行时不注入这个端口，含 agent 节点的流程在 check 就会被拒。
 */
export interface FlowAgentPort {
  open(context: {
    readonly workspace: string;
    readonly sessionId: string | undefined;
    readonly signal: AbortSignal;
  }): Promise<FlowAgentRunner>;
}

/**
 * 校验的额外口径：`agents` 为假表示这一份运行时没有 agent 通道，含 agent 节点的流程直接报。
 */
export interface FlowCheckOptions {
  readonly agents?: boolean | undefined;
  readonly ai?: boolean | undefined;
}
