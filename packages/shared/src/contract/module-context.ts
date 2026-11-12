/**
 * 模块拿得到的上下文：只承诺 `get` / `effect` / `logger`，不把 dsh 的 cordis Context 整棵交出去。
 */
export interface HostContext {
  get<T = unknown>(name: string): T | undefined;
  effect(effect: () => void | (() => void), label?: string): unknown;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
}

/**
 * 浏览器半侧的模块上下文：与宿主侧同一组能力，名字分开是为了让两边的契约各说各的。
 */
export type ClientContext = HostContext;

/**
 * 工具声明的输出面：schema 原样交给 dsh，render 只承诺返回一段可渲染内容。
 */
export interface ToolOutputDefinition {
  readonly schema: Readonly<Record<string, unknown>>;
  render(args: unknown, value: unknown): readonly unknown[];
}

/**
 * 模块注册给 agent 的工具：只保留模块会写的字段，dsh 的其余可选字段由外壳转发。
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly output: ToolOutputDefinition;
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>;
}

/**
 * 工具执行时模块拿得到的那点上下文：会话 id 与工作区路径，够 kit 里的会话取法用。
 */
export interface ToolRunContext {
  readonly signal?: AbortSignal;
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
 * 工具注册表：模块只看到 `register`，拿回来的清理函数在卸载 / 热换时调。
 */
export interface ToolRegistry {
  register(tool: ToolDefinition): () => void;
}
