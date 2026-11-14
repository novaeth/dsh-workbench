export interface DataRequestBase {
  readonly timeoutMs?: number;
}

export interface DataCallOptions {
  readonly signal?: AbortSignal | undefined;
  readonly open?: boolean | undefined;
}

export interface HttpDataRequest extends DataRequestBase {
  readonly kind: 'http';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface BrowserDataRequest extends DataRequestBase {
  readonly kind: 'browser';
  readonly script: string;
  readonly url?: string;
  readonly loginUrl?: string;
  readonly session?: string;
  readonly open?: boolean;
}

export interface CommandDataRequest extends DataRequestBase {
  readonly kind: 'command';
  readonly adapter: string;
  readonly argv: readonly string[];
}

export type DataRequest = HttpDataRequest | BrowserDataRequest | CommandDataRequest;

export type DataErrorCode =
  | 'invalid-request'
  | 'http'
  | 'auth'
  | 'permission-denied'
  | 'timeout'
  | 'aborted'
  | 'skipped'
  | 'parse'
  | 'command'
  | 'browser';

export interface DataError {
  readonly code: DataErrorCode;
  readonly message: string;
  readonly status?: number;
  readonly detail?: string;
  readonly hint?: string;
  readonly helpUrl?: string;
  readonly pageCode?: string;
}

export interface DataSuccess<T = unknown> {
  readonly ok: true;
  readonly data: T;
}

export interface DataFailure {
  readonly ok: false;
  readonly error: DataError;
}

export type DataResult<T = unknown> = DataSuccess<T> | DataFailure;

export interface CredentialSourceCookie {
  readonly kind: 'cookie';
}

export interface CredentialSourceCookieValue {
  readonly kind: 'cookieValue';
  readonly name: string;
}

export interface CredentialSourceEndpoint {
  readonly kind: 'endpoint';
  readonly url: string;
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
  readonly path: string;
}

export interface CredentialSourceMeta {
  readonly kind: 'meta';
  readonly name: string;
}

export interface CredentialSourceGlobal {
  readonly kind: 'global';
  readonly path: string;
}

export interface CredentialSourceStorage {
  readonly kind: 'storage';
  readonly area: 'local' | 'session';
  readonly key: string;
  readonly path?: string;
}

export type CredentialSource =
  | CredentialSourceCookie
  | CredentialSourceCookieValue
  | CredentialSourceEndpoint
  | CredentialSourceMeta
  | CredentialSourceGlobal
  | CredentialSourceStorage;

export type CredentialPlace =
  | { readonly in: 'cookie' }
  | { readonly in: 'header'; readonly name: string; readonly prefix?: string }
  | { readonly in: 'query'; readonly name: string }
  | { readonly in: 'body'; readonly field: string };

export type RecipeAuth =
  | { readonly kind: 'none' }
  | { readonly kind?: undefined; readonly source: CredentialSource; readonly place: CredentialPlace };

export interface RecipeRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly contentType?: 'json' | 'form';
}

export interface RecipeResponse {
  readonly kind: 'json' | 'text';
  readonly path?: string;
  readonly maxBytes?: number;
}

export interface RequestRecipe {
  readonly origin: string;
  readonly loginUrl?: string;
  readonly session?: string;
  readonly timeoutMs?: number;
  readonly auth?: RecipeAuth;
  readonly request: RecipeRequest;
  readonly response?: RecipeResponse;
}

export interface CallOverrides {
  readonly path?: string;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly response?: Partial<RecipeResponse>;
}

export type RecipeCalls = Readonly<Record<string, CallOverrides>>;

export type RecipeResults<T = unknown> = Readonly<Record<string, DataResult<T>>>;

export interface PlanStepResponse {
  readonly kind?: 'json' | 'text' | 'bytes' | 'html';
  readonly path?: string;
  readonly maxBytes?: number;
  readonly selector?: string;
  readonly fields?: Readonly<Record<string, string>>;
  readonly saveAs?: 'attachment';
}

/** 分页：`over` 支持 `1..{{total}}` 这种数字区间（`total` 是前面某一步的名字）；`as` 是每轮变量名，默认 `item`。 */
export interface PlanRepeat {
  readonly over: string;
  readonly as?: string;
  readonly max?: number;
}

/** 分页：每轮请求可用 `{{page}}` / `{{index}}`；`path` 相对原始 JSON 响应。 */
export interface PlanWhile {
  readonly path: string;
  readonly equals: unknown;
  readonly max?: number;
}

/** 计划里的一步：`name` 供后面的步用 `{{name}}` 引用。 */
export interface PlanStep {
  readonly name: string;
  readonly request: RecipeRequest;
  readonly response?: PlanStepResponse;
  readonly repeat?: PlanRepeat;
  readonly while?: PlanWhile;
}

/**
 * 计划级登录丢失形状：命中就整支失败并回 `auth`；OA 的 `errorCode: '002'` 写在模块自己的 plan 里。
 * `equals` 与 `in` 二选一；`loginUrl` 要是绝对 http(s) URL（决定卡片上有没有「去登录」）。
 */
export interface AuthLoss {
  readonly path: string;
  readonly equals?: unknown;
  readonly in?: readonly unknown[];
  readonly messagePath?: string;
}

export interface RequestPlan {
  readonly origin: string;
  readonly loginUrl?: string;
  readonly session?: string;
  readonly timeoutMs?: number;
  readonly authLoss?: AuthLoss;
  readonly steps: readonly PlanStep[];
}

export type PlanStepResult<T = unknown> = DataResult<T> & { readonly elapsedMs?: number };

export type PlanResults = Readonly<Record<string, PlanStepResult<unknown>>>;

/**
 * 写计划的调用参数：幂等键必填，逐步骤确认由调用方给；`confirm` 返回 false 就停，不写。
 * 只能在 `writes: true` 的工具/动作实现里调用 —— 审批门在工具层先过，这里不重复审批。
 */
export interface SubmitPlanOptions extends DataCallOptions {
  readonly idempotencyKey: string;
  readonly confirm: (step: PlanStep, index: number) => boolean | Promise<boolean>;
  readonly onStep?: ((step: PlanStep, index: number, result: PlanStepResult<unknown>) => void) | undefined;
}

export interface DataReader {
  read<T = unknown>(request: DataRequest, options?: DataCallOptions): Promise<DataResult<T>>;
  request<T = unknown>(
    recipe: RequestRecipe,
    overrides?: CallOverrides,
    options?: DataCallOptions,
  ): Promise<DataResult<T>>;
  requestMany<T = unknown>(
    recipe: RequestRecipe,
    calls: RecipeCalls,
    options?: DataCallOptions,
  ): Promise<RecipeResults<T>>;
  plan(plan: RequestPlan, options?: DataCallOptions): Promise<PlanResults>;
  submitPlan(plan: RequestPlan, options: SubmitPlanOptions): Promise<PlanResults>;
  submit<T = unknown>(
    recipe: RequestRecipe,
    overrides?: CallOverrides,
    options?: DataCallOptions,
  ): Promise<DataResult<T>>;
}
