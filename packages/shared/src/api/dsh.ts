import type { IncomingMessage, ServerResponse } from 'node:http';

import type {} from '@deepseek-ai/cordis-plugin-loader';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-agent-preset-registry';
import type {} from '@deepseek-ai/dsh-app-boot';
import type {} from '@deepseek-ai/dsh-hmr';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-plugin-manager';
import type {} from '@deepseek-ai/dsh-sandbox-policy';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-session-projection';
import type {} from '@deepseek-ai/dsh-shell';
import type {} from '@deepseek-ai/dsh-subagent';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-user-approval';
import type {} from '@deepseek-ai/dsh-workspace';

import type { Context } from '@deepseek-ai/cordis';
import type { Entry, Loader } from '@deepseek-ai/cordis-plugin-loader';
import type { Agent, AgentHandle, AgentOptions, AgentRegistry } from '@deepseek-ai/dsh-agent';
import type { SubagentActivation, SubagentResult, SubagentRuntime } from '@deepseek-ai/dsh-subagent';
import type { AgentPresetRegistry, PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry';
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot';
import type { IndexInjection, WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { dshHomePath } from '@deepseek-ai/dsh-home-paths';
import type { PluginInstallRequestId, PluginManager } from '@deepseek-ai/dsh-plugin-manager';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import type { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy';
import type { ShellExecution, ShellExecutor } from '@deepseek-ai/dsh-shell';
import type { AssembleContext, PromptAssembly } from '@deepseek-ai/dsh-system-prompt';
import type { ToolDefinition, ToolOutputDefinition, ToolRunContext, ToolsService } from '@deepseek-ai/dsh-tools';
import type { Workspace, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace';
import type { ContentBlock, ToolSchema } from '@deepseek-ai/dsh-llm';

/** 宿主 logger（`ctx.logger`）的原型，`info` 与 `warn` 调用前仍要判存在。 */
export type { LoggerService as DshLogger } from '@deepseek-ai/cordis';

/** 宿主 HTTP 路由拿到的请求（node:http 的 `IncomingMessage`）。 */
export type DshRequest = IncomingMessage;

/** 宿主 HTTP 路由要写的响应（node:http 的 `ServerResponse`）。 */
export type DshResponse = ServerResponse;

/** 一条挂到 dsh web 服务器上的路由（`ctx.webServer.register` 收的形状）。 */
export type { WebRoute as DshWebRoute };

/** 宿主插件能看到的 profile 现场（服务名 `profileContext`）。 */
export type { ProfileContext as DshProfileContext };

/** 工具声明的静态半（名字、描述与参数表）。 */
export type { ToolSchema as DshToolSchema };

/** 系统提示词装配到一半的那份（`system-prompt/assemble` 的第一个参数）。 */
export type { PromptAssembly as DshPromptAssembly };

/** 装配提示词时给判定方的现场（`system-prompt/assemble` 的第二个参数）。 */
export type { AssembleContext as DshAssemblyContext };

/** 一条 index 注入行（`webserver/index-inject` 表里的项）。 */
export type { IndexInjection as DshIndexRow };

/** dsh 的插件管理服务（服务名 `pluginManager`）：装卸组合包、列版本、读来源。 */
export type { PluginManager as DshPluginManager };

/** 一次插件安装请求的 id（dsh 的 branded 串）。 */
export type { PluginInstallRequestId as DshPluginInstallRequestId };

/** 宿主插件上下文：cordis 的 `Context`，dsh 各服务与事件靠官方包的模块声明补进来。 */
export type { Context as DshHostContext };

/** 一次 shell 执行的句柄：`result()` 给退出码、超时与中断标志和截断过的输出。 */
export type { ShellExecution as DshShellExecution };

/** dsh 的 shell 服务（服务名 `shell`）；外壳只用到 `resolve` 与 `execute`。 */
export type DshShell = Pick<ShellExecutor, 'resolve' | 'execute'>;

/** 一条工作区记录（dsh 工作区登记处的实体，按路径认领 / 新建时认的就是它）。 */
export type { Workspace as DshWorkspaceRecord };

/** 宿主侧的工作区登记处（服务名 `workspaceRegistry`）。 */
export type DshWorkspaceRegistry = Pick<WorkspaceRegistry, 'create' | 'resolveByPath'>;

/** agent preset 名册里的一行：id、显示名与 dsh 自己给的挂起原因。 */
export type { AgentPreset as DshAgentPresetRow } from '@deepseek-ai/dsh-agent-preset-registry';

/** 一条 agent preset 的定义（`@deepseek-ai/dsh-agent-preset` 收的那份配置）。 */
export type { PresetDefinition as DshAgentPresetDefinition };

/** `register()` 成功后拿到的注销函数。 */
export type DshAgentPresetUnregister = Awaited<ReturnType<AgentPresetRegistry['register']>>;

/** 宿主侧的 agent preset 名册（服务名 `agentPresets`）。 */
export type DshAgentPresetRegistry = Pick<AgentPresetRegistry, 'list' | 'register'>;

/** dsh loader 里的一行：插件名与它收到的原始 config。 */
export type DshLoaderEntry = Entry;

/** loader 服务（服务名 `loader`）：插件行都在它的 `entries()` 里。 */
export type DshLoader = Pick<Loader, 'entries'>;

/** 把相对路径拼成 dsh home 下绝对路径的那个函数（`@deepseek-ai/dsh-home-paths` 的 `dshHomePath`）。 */
export type DshHomePath = typeof dshHomePath;

/** 要注册进 dsh 的一把工具：模型面 schema、输出声明与执行体。 */
export type { ToolDefinition as DshToolDefinition };

/** 一把工具的输出声明：校验用的 JSON Schema 加投影函数。 */
export type { ToolOutputDefinition as DshToolOutputDefinition };

/** 工具执行时给的那点现场（会话与 cwd 都在 `exec.agent.session` 上）。 */
export type { ToolRunContext as DshToolRunContext };

/** dsh 的审批服务（服务名 `approval`）：读一个会话此刻生效的审批策略。 */
export type DshApprovalService = Pick<ApprovalService, 'config' | 'overrideOf'>;

/** 一次调用生效的文件边界（dsh 的沙箱执行策略）。 */
export type { SandboxExecutionPolicy as DshShellSandboxPolicy } from '@deepseek-ai/dsh-sandbox';

/** dsh 的沙箱策略服务（服务名 `sandboxPolicy`）：按会话解析这次调用生效的文件边界。 */
export type DshSandboxPolicy = Pick<SandboxPolicyService, 'resolve'>;

/** dsh 的工具表（服务名 `tools`）；`register` 回的清理函数在卸载时摘掉这条工具。 */
export type DshToolRegistry = Pick<ToolsService, 'register'>;


/** 一个活着的 agent 句柄（`ctx.agents.get()` 拿到的那个）；子 agent 的 `parent` 就是它。 */
export type DshAgent = Agent;

/** `ctx.agents.create()` 回的那把句柄：只有它能拆掉这条 agent。 */
export type DshAgentHandle = AgentHandle;

/** 起一条 agent 时的模型选择与输出上限。 */
export type DshAgentOptions = AgentOptions;

/** 宿主侧的 agent 名册（服务名 `agents`）：按会话 id 找活着的 agent，也能自己起一条。 */
export type DshAgentRegistry = Pick<AgentRegistry, 'get' | 'create'>;

/** 自己起一条 agent 时给的那份：会话 id、会话元数据（目录 / 来源 / 模式）与模型选择。 */
export type DshCreateAgentOptions = Parameters<AgentRegistry['create']>[0];

/** 子代理服务（服务名 `subagents`）：按 provider 起一条受管子 agent。 */
export type DshSubagentRuntime = Pick<SubagentRuntime, 'startActivation' | 'getProvider'>;

/** 一条起好的子 agent：身份、结果与收摊。 */
export type DshSubagentActivation = SubagentActivation;

/** 子 agent 跑完的结果：最后一条回复、可选的结构化值、停止原因。 */
export type DshSubagentResult = SubagentResult;

/** 一条消息内容块（子 agent 的 prompt 与输出都是它）。 */
export type DshContentBlock = ContentBlock;

/** 一条会话 id 的 branded 串（子 agent 可以预先指定）。 */
export type DshSessionId = import('@deepseek-ai/dsh-session').SessionId;

/** 子 agent 结构化输出收的那份对象根 JSON Schema（dsh 的受支持子集）。 */
export type DshObjectJsonSchema = import('@deepseek-ai/dsh-tools').ObjectJsonSchema;
