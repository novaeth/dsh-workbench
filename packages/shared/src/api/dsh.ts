/**
 * 宿主侧的日志口；info 与 warn 都可能没有，调用前要判存在。
 */
export interface DshLogger {
  info?(message: string): void;
  warn?(message: string): void;
}

/**
 * 宿主 HTTP 路由拿到的请求：方法与 URL，请求体是异步可迭代的字节流。
 */
export interface DshRequest {
  readonly method?: string;
  readonly url?: string;
  [Symbol.asyncIterator]?(): AsyncIterator<Uint8Array>;
}

/**
 * 宿主 HTTP 路由要写的响应：statusCode、setHeader 与 end 必备，流式那几个方法可选。
 */
export interface DshResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
  writeHead?(status: number, headers: Record<string, string>): void;
  write?(chunk: string): void;
  on?(event: 'close', listener: () => void): void;
}

/**
 * 一条挂到 dsh web 服务器上的路由；kind 说明 path 是前缀还是全等匹配，handler 自己写响应。
 */
export interface DshWebRoute {
  readonly kind: 'prefix' | 'exact';
  readonly path: string;
  readonly handler: (req: DshRequest, res: DshResponse) => void | Promise<void>;
}

/**
 * 宿主插件能看到的 profile 现场；dir 缺省表示 dsh 没给这个信息。
 */
export interface DshProfileContext {
  readonly dir?: string;
}

/**
 * 工具声明的静态半（名字加其余关键字）；外壳只按 name 认工具。
 */
export interface DshToolSchema {
  readonly name: string;
  readonly [key: string]: unknown;
}

/**
 * 系统提示词装配到一半的那份；tools 是可改的工具表，其余字段随 dsh。
 */
export interface DshPromptAssembly {
  readonly tools?: readonly DshToolSchema[] | undefined;
  readonly [key: string]: unknown;
}

/**
 * 装配提示词时给判定方的现场（哪个 agent、哪个作用域）；两者都可能缺。
 */
export interface DshAssemblyContext {
  readonly agent?: unknown;
  readonly scope?: unknown;
  readonly [key: string]: unknown;
}

/**
 * 宿主插件上下文：on 订阅 dsh 的钩子（提示词装配、工具执行前后、agent 生命周期），webServer 挂路由。
 */
export interface DshHostContext {
  on?: {
    (
      event: 'system-prompt/assemble',
      listener: (
        assembly: DshPromptAssembly,
        context: DshAssemblyContext,
        next: () => Promise<DshPromptAssembly>,
      ) => Promise<DshPromptAssembly>,
    ): (() => void) | undefined;
  } & {
    (
      event: 'tools/pre-execute',
      listener: (
        exec: {
          name?: string;
          arguments?: unknown;
          readonly agent?: DshToolRunContext['agent'];
        },
        next: () => Promise<
          | { kind: 'allow' }
          | { kind: 'deny'; reason: string }
          | { kind: 'cancel' }
          | { kind: 'ask'; reason?: string; displayReason?: Record<string, string> }
        >,
      ) => Promise<
        | { kind: 'allow' }
        | { kind: 'deny'; reason: string }
        | { kind: 'cancel' }
        | { kind: 'ask'; reason?: string; displayReason?: Record<string, string> }
      >,
    ): (() => void) | undefined;
  } & {
    (
      event: 'tools/post-execute',
      listener: (
        exec: { name?: string; arguments?: unknown },
        result: unknown,
        next: () => unknown,
      ) => unknown,
    ): (() => void) | undefined;
  } & {
    (
      event: 'agent/created',
      listener: (payload: { agent?: unknown }) => void,
    ): (() => void) | undefined;
  } & {
    (
      event: 'agent/pre-step',
      listener: (
        payload: { agent?: unknown; messages?: readonly unknown[] },
        next: () => Promise<{ kind: string; messages?: readonly unknown[] }>,
      ) => Promise<{ kind: string; messages?: readonly unknown[] }>,
    ): (() => void) | undefined;
  };
  get<T = unknown>(name: string): T | undefined;
  provide(name: string, value: unknown): () => void;
  effect(effect: () => void | (() => void), label?: string): () => void;
  inject(names: readonly string[], effect: (scoped: DshHostContext) => void): () => void;
  readonly logger?: DshLogger;
  readonly webServer: { register(route: DshWebRoute): () => void };
}

/**
 * 一次 shell 执行的结果口：result() 给退出码、超时与中断标志，以及截断过的 stdout / stderr。
 */
export interface DshShellExecution {
  result(): Promise<{
    exitCode: number | null;
    timedOut: boolean;
    aborted: boolean;
    stdout: { text: string; truncated: boolean };
    stderr: { text: string; truncated: boolean };
  }>;
}

/**
 * dsh 的 shell 服务：先 resolve 出执行规格，再把它原样喂给 execute。
 */
export interface DshShell {
  resolve(request: {
    command: string;
    workdir?: string;
    timeoutMs?: number;
    onExpiry?: 'kill' | 'none';
    stdoutMaxBytes?: number;
    signal?: AbortSignal;
  }): unknown;
  execute(spec: unknown): Promise<DshShellExecution>;
}

/** 一条工作区记录：id、磁盘路径与显示名（登记处按路径认领 / 新建时认的就是它）。 */
export interface DshWorkspaceRecord {
  readonly id: string;
  readonly path: string;
  readonly title: string;
}

/**
 * 宿主侧的工作区登记处：按 id 查、按路径认领、按路径新建。
 */
export interface DshWorkspaceRegistry {
  get(id: string): { id: string; path?: string; title?: string } | undefined;
  resolveByPath(path: string): Promise<DshWorkspaceRecord | undefined>;
  create(path: string, title?: string): Promise<{ id?: string; path?: string; title?: string } | undefined>;
}

/**
 * agent preset 名单里的一行：id 与显示名；`broken` 非空表示这一行**挂不起来**（dsh 自己给的原因原文）。
 */
export interface DshAgentPresetRow {
  readonly id: string;
  readonly name?: string;
  readonly broken?: string;
}

/**
 * 宿主侧的 agent preset 名册（服务名 `agentPresets`）：只读它的 `list()` —— 启动体检拿它判 DIY 模式挂不挂得起来。
 */
export interface DshAgentPresetRegistry {
  list(): Promise<readonly DshAgentPresetRow[]>;
}

/**
 * 把相对路径拼成 dsh home 下的绝对路径（服务名 dshHomePath）；外壳存自己的状态用它，不自己拼 home。
 */
export type DshHomePath = (relative: string) => string;

/**
 * 要注册进 dsh 的一把工具：名字、描述、参数表、输出渲染与执行体。
 */
export interface DshToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: {
    schema: Record<string, unknown>;
    render(args: unknown, value: unknown): Array<Record<string, unknown>>;
  };
  execute(args: unknown, exec: DshToolRunContext): Promise<unknown>;
}

/**
 * 工具执行时给的那点现场（会话 id 与 cwd）；层级都可能缺，缺了就当不知道。
 */
export interface DshToolRunContext {
  readonly agent?:
    | {
        readonly session?:
          | {
              readonly id?: string;
              readonly header?: { readonly cwd?: string } | undefined;
            }
          | undefined;
      }
    | undefined;
}

/**
 * dsh 的审批服务（服务名 `approval`）：读一个会话此刻生效的审批策略。
 * 方法可选：服务缺席或老版本没有它时，调用方必须当成「不知道」而不是「已关闭」。
 */
export interface DshApprovalService {
  effectivePolicy?(session: unknown): 'ask' | 'never' | undefined;
}

/**
 * dsh 的沙箱策略服务（服务名 `sandboxPolicy`）：按会话解析这次调用生效的文件边界。
 * 方法可选：服务缺席或老版本没有它时，调用方必须当成「不知道」而不是「完全放行」。
 */
export interface DshSandboxPolicy {
  resolve?(request?: { readonly session?: unknown }): { readonly mode?: string } | undefined;
}

/**
 * dsh 的工具表；register 回的清理函数负责在插件卸载时摘掉这条工具。
 */
export interface DshToolRegistry {
  register(definition: DshToolDefinition): () => void;
}
