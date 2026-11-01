import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { dshHome } from './data-root.js';
import type { ShellKind } from './shell-text.js';

export type EnvLayer = Readonly<Record<string, string | undefined>>;

/**
 * 把父进程环境里的字符串值拷成一层 env（丢掉 undefined）。
 * @param parent 父环境（通常是 `process.env`）。
 * @returns 可继续叠加的 env 层。
 */
export function inheritedEnvOf(parent: NodeJS.ProcessEnv | EnvLayer): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parent)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

/**
 * 在一层 env 上叠另一层；`undefined` 表示删掉这个键。
 * @param base 底层 env。
 * @param layer 上层 env；值为 undefined 的键被删除。
 * @returns 叠加后的新对象。
 */
export function overlayEnvOf(
  base: EnvLayer,
  layer: EnvLayer | undefined,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...base };
  for (const [key, value] of Object.entries(layer ?? {})) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/**
 * 把 env 层收成只含字符串的 env（用于执行缝 `env` 参数）。
 * @param layer env 层。
 * @returns 只含字符串键值的对象。
 */
export function envTextOf(layer: EnvLayer): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(layer)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * 在 PATH 前面插一组目录（去重、空项丢掉）。
 * @param parentPath 原来的 PATH。
 * @param bins 要前插的目录，按顺序。
 * @param separator 平台分隔符，默认 `path.delimiter`。
 * @returns 新的 PATH。
 */
export function pathWithBinsOf(
  parentPath: string | undefined,
  bins: readonly string[],
  separator: string = delimiter,
): string {
  const parts = (parentPath ?? '').split(separator).filter((part) => part !== '' && !bins.includes(part));
  return [...bins, ...parts].join(separator);
}

function existingPointer(realHome: string, name: string): string | undefined {
  const file = join(realHome, name);
  return existsSync(file) ? file : undefined;
}

export interface ProductEnvInput {
  readonly runtimeRoot: string;
  readonly home?: string | undefined;
  readonly realHome?: string | undefined;
}

/**
 * 产品域（运行时根）的受控 env：隔离 HOME、npm/pnpm 缓存都钉在运行时根，真 npmrc/gitconfig 只读指过去。
 * @param input 运行时根、可选的 HOME 与真实用户目录。
 * @returns 产品域 env。
 */
export function productEnvOf(input: ProductEnvInput): Record<string, string> {
  const runtimeRoot = input.runtimeRoot;
  const realHome = input.realHome ?? homedir();
  const env: Record<string, string> = {
    HOME: input.home ?? join(runtimeRoot, 'home'),
    DSH_HOME: dshHome(),
    DSH_WORKBENCH_HOME: runtimeRoot,
    npm_config_cache: join(runtimeRoot, 'npm-cache'),
    NPM_CONFIG_CACHE: join(runtimeRoot, 'npm-cache'),
    npm_config_logs_dir: join(runtimeRoot, 'npm-logs'),
    npm_config_store_dir: join(runtimeRoot, 'pnpm-store'),
    npm_config_cache_dir: join(runtimeRoot, 'pnpm-cache'),
    npm_config_state_dir: join(runtimeRoot, 'pnpm-state'),
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    NO_UPDATE_NOTIFIER: '1',
  };
  const npmrc = existingPointer(realHome, '.npmrc');
  if (npmrc !== undefined) env['NPM_CONFIG_USERCONFIG'] = npmrc;
  const gitconfig = existingPointer(realHome, '.gitconfig');
  if (gitconfig !== undefined) env['GIT_CONFIG_GLOBAL'] = gitconfig;
  return env;
}

export interface UnitEnvInput extends ProductEnvInput {
  readonly unitRoot: string;
}

/**
 * 模块单元的受控 env：在产品域基础上把 HOME 与 npm/pnpm 目录全钉到单元数据目录。
 * @param input 运行时根、单元数据目录、可选的 TRUE 用户目录。
 * @returns 单元 env。
 */
export function unitEnvOf(input: UnitEnvInput): Record<string, string> {
  const unitRoot = input.unitRoot;
  return {
    ...productEnvOf({ ...input, home: join(unitRoot, 'home') }),
    npm_config_cache: join(unitRoot, 'npm-cache'),
    NPM_CONFIG_CACHE: join(unitRoot, 'npm-cache'),
    npm_config_logs_dir: join(unitRoot, 'npm-logs'),
    npm_config_store_dir: join(unitRoot, 'pnpm-store'),
    npm_config_cache_dir: join(unitRoot, 'pnpm-cache'),
    npm_config_state_dir: join(unitRoot, 'pnpm-state'),
  };
}

export interface BootstrapEnvInput {
  readonly root: string;
  readonly realHome: string;
  readonly shellKind: ShellKind;
  readonly parent?: NodeJS.ProcessEnv | EnvLayer | undefined;
  readonly path?: string | undefined;
}

/**
 * 自举/装工具链的受控 env：继承父环境，HOME 与 npm 缓存钉到运行时根，PATH 可换成桌面自带 bin。
 * @param input 运行时根、真实用户目录、shell 种类、父环境与可选的 PATH。
 * @returns 自举 env。
 */
export function bootstrapEnvOf(input: BootstrapEnvInput): Record<string, string> {
  const env = inheritedEnvOf(input.parent ?? process.env);
  if (input.path !== undefined) env['PATH'] = input.path;
  const home = join(input.root, 'home');
  env['HOME'] = home;
  if (input.shellKind === 'pwsh') env['USERPROFILE'] = home;
  const userConfig = existingPointer(input.realHome, '.npmrc');
  if (userConfig !== undefined) env['NPM_CONFIG_USERCONFIG'] = userConfig;
  const cache = join(input.root, 'npm-cache');
  env['npm_config_cache'] = cache;
  env['NPM_CONFIG_CACHE'] = cache;
  env['NO_COLOR'] = '1';
  env['TERM'] = 'dumb';
  return env;
}

/**
 * git 的非交互 env：关掉终端提示/askpass；Windows 上不给 askpass 指 POSIX 路径（那台机器上没有）。
 * @param platform 宿主平台。
 * @returns git 非交互 env。
 */
export function promptlessGitEnvOf(platform: NodeJS.Platform): Record<string, string> {
  const shared = {
    GIT_TERMINAL_PROMPT: '0',
    SSH_ASKPASS_REQUIRE: 'never',
    GCM_INTERACTIVE: 'never',
    GIT_SSH_COMMAND: 'ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new',
  };
  if (platform === 'win32') return shared;
  return { ...shared, GIT_ASKPASS: '/usr/bin/false', SSH_ASKPASS: '/usr/bin/false' };
}

/**
 * 在父环境上叠加 `promptlessGitEnvOf`，得到可传给执行缝的 git env。
 * @param parent 父环境。
 * @param platform 宿主平台。
 * @returns 只含字符串的 env。
 */
export function promptlessProcessEnvOf(
  parent: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): Record<string, string> {
  const env = { ...inheritedEnvOf(parent), ...promptlessGitEnvOf(platform) };
  if (platform === 'win32') {
    delete env['GIT_ASKPASS'];
    delete env['SSH_ASKPASS'];
  }
  return env;
}
