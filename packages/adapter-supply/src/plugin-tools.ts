import type { ApprovalDetail, ApprovalPolicy, ApprovalVerdict } from '@dsh-workbench/shared/host';
import type { OpencliSession } from '@dsh-workbench/adapter-runtime';
import { withApprovalNote } from '@dsh-workbench/shared/host';
import type { PluginCommand, PluginCommandArg } from './plugin-catalog.js';

const SCHEMA_TYPE: Readonly<Record<string, string>> = {
  int: 'integer',
  integer: 'integer',
  number: 'number',
  float: 'number',
  bool: 'boolean',
  boolean: 'boolean',
  string: 'string',
};

const KEY_ARG_LIMIT = 3;

const NO_KEY_ARGS = '没有带参数';

export const RUN_CODE_TOOL = 'run_code';

export const PLUGIN_PROMPT_BUDGET = 4_000;

export function pluginToolName(plugin: string, command: string): string {
  return `${plugin}_${command}`
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
}

function schemaTypeOf(arg: PluginCommandArg): string {
  return SCHEMA_TYPE[arg.type.toLowerCase()] ?? 'string';
}

function propertyOf(arg: PluginCommandArg): Record<string, unknown> {
  const type = schemaTypeOf(arg);
  const enumValues = type === 'string' && arg.choices.length > 0 ? [...arg.choices] : undefined;
  return {
    type,
    ...(arg.help.trim() === '' ? {} : { description: arg.help.trim() }),
    ...(enumValues === undefined ? {} : { enum: enumValues }),
    ...(arg.defaultValue === undefined ? {} : { default: arg.defaultValue }),
  };
}

export function pluginPromptChars(command: PluginCommand): number {
  return (
    pluginToolDescription(command).length +
    command.args.reduce((sum, arg) => sum + arg.help.trim().length, 0)
  );
}

export function pluginToolParameters(command: PluginCommand): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const arg of command.args) properties[arg.name] = propertyOf(arg);
  const required = command.args.filter((arg) => arg.required).map((arg) => arg.name);
  const schema: Record<string, unknown> = {
    type: 'object',
    properties,
    ...(required.length === 0 ? {} : { required }),
    additionalProperties: false,
  };
  return pluginToolWrites(command) ? withApprovalNote(schema, { required: true }) : schema;
}

export function pluginToolDescription(command: PluginCommand): string {
  const described = command.description.trim();
  return described === '' ? `${command.plugin} ${command.name}（opencli 命令）` : described;
}

export function pluginToolWrites(command: PluginCommand): boolean {
  return command.access !== 'read';
}

export function pluginToolSession(command: PluginCommand): OpencliSession {
  if (!command.browser) return 'none';
  if (command.siteSession === 'persistent' || command.siteSession === 'ephemeral') {
    return command.siteSession;
  }
  return command.access === 'read' ? 'persistent' : 'ephemeral';
}

function valuesOf(raw: unknown): Readonly<Record<string, unknown>> {
  return typeof raw === 'object' && raw !== null ? (raw as Readonly<Record<string, unknown>>) : {};
}

export function pluginToolArgv(command: PluginCommand, raw: unknown): string[] {
  const values = valuesOf(raw);
  const argv: string[] = [];
  for (const arg of command.args) {
    if (!arg.positional) continue;
    const value = values[arg.name];
    if (value === undefined || value === null) continue;
    argv.push(String(value));
  }
  for (const arg of command.args) {
    if (arg.positional) continue;
    const value = values[arg.name];
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') argv.push(`--${arg.name}=${value ? 'true' : 'false'}`);
    else if (Array.isArray(value)) argv.push(`--${arg.name}=${value.map((item) => String(item)).join(',')}`);
    else argv.push(`--${arg.name}=${String(value)}`);
  }
  return argv;
}

export function pluginKeyArgs(command: PluginCommand, raw: unknown): string {
  const values = valuesOf(raw);
  const ordered = [...command.args.filter((arg) => arg.required), ...command.args.filter((arg) => !arg.required)];
  const parts: string[] = [];
  for (const arg of ordered) {
    const value = values[arg.name];
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${arg.name}=${String(value)}`);
    if (parts.length === KEY_ARG_LIMIT) break;
  }
  return parts.length === 0 ? NO_KEY_ARGS : parts.join('、');
}

export function pluginApprovalQuestion(command: PluginCommand, raw: unknown): ApprovalDetail {
  const key = pluginKeyArgs(command, raw);
  const zhKey = key === NO_KEY_ARGS ? '这次没带参数' : key;
  const enKey = key === NO_KEY_ARGS ? 'no arguments' : key;
  return {
    zh: `agent 想执行工作台 [${command.plugin}] opencli 插件的 [${command.name}] 命令（${zhKey}），允许吗？`,
    en: `The agent wants to run the [${command.name}] command of the workbench opencli plugin [${command.plugin}] (${enKey}). Allow?`,
  };
}

export function pluginApprovalFor(command: PluginCommand): ApprovalPolicy {
  const denied = command.access === 'read';
  return (call) => {
    if (denied) return { kind: 'read' } satisfies ApprovalVerdict;
    const question = pluginApprovalQuestion(command, call.arguments);
    return {
      kind: 'ask',
      reason:
        command.access === 'write'
          ? `${command.plugin} ${command.name} 在 opencli 里标着 write`
          : `${command.plugin} ${command.name} 没有拿到 access（fail-safe：按写处理）`,
      question,
      fallback: question,
    } satisfies ApprovalVerdict;
  };
}
