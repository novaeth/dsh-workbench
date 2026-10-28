/**
 * 模块要的一样东西的类别；v2 只认这四种，加种类在注册表里加，不改这份形状。
 */
export const NEED_KINDS = ['bin', 'extension', 'lib', 'env'] as const;

/**
 * need 的类别。
 */
export type NeedKind = (typeof NEED_KINDS)[number];

/**
 * 一种外部来源；每一种都只说「去哪拿」，装不装、怎么装由宿主决定。
 */
export type SupplySource =
  | {
      readonly kind: 'npm';
      readonly package?: string;
      readonly registryEnv?: string;
      readonly registryDefault?: string;
    }
  | { readonly kind: 'git'; readonly url: string; readonly ref?: string }
  | { readonly kind: 'local'; readonly path?: string; readonly env?: string };

/**
 * 协议认得的外部来源种类。
 */
export const SUPPLY_SOURCE_KINDS = ['npm', 'git', 'local'] as const;

/**
 * 外部来源的类别。
 */
export type SupplySourceKind = (typeof SUPPLY_SOURCE_KINDS)[number];

/**
 * 每条 need 都有的字段：为什么需要它、缺了算不算问题。
 */
export interface NeedCommon {
  readonly kind: NeedKind;
  readonly purpose: string;
  readonly required?: boolean;
  readonly id?: string;
}

/**
 * 一条装这个可执行文件的命令；模块作者写，工作台照抄执行。
 */
export type BinInstall =
  | {
      readonly kind: 'command';
      readonly line: string;
      readonly platforms?: readonly string[] | undefined;
    }
  | {
      readonly kind: 'npm';
      readonly package: string;
      readonly registryEnv?: string | undefined;
      readonly registryDefault?: string | undefined;
      readonly platforms?: readonly string[] | undefined;
    };

/**
 * 机器上要有一个可执行文件；探法是 `command -v` / `where`。
 */
export interface BinNeed extends NeedCommon {
  readonly kind: 'bin';
  readonly name: string;
  readonly install?: BinInstall | undefined;
  readonly docs?: string | undefined;
}

/**
 * 某个运行时上要有一个扩展（opencli 的插件就是这种），并且要提供这些命令。
 */
export interface ExtensionNeed extends NeedCommon {
  readonly kind: 'extension';
  readonly runtime: string;
  readonly name: string;
  readonly commands?: readonly string[];
  readonly version?: string;
  readonly sources?: readonly SupplySource[];
}

/**
 * 要在隔离运行时里有一个共用依赖包。
 */
export interface LibNeed extends NeedCommon {
  readonly kind: 'lib';
  readonly name: string;
  readonly version?: string;
  readonly sources?: readonly SupplySource[];
}

/**
 * 跑起来时要有这个环境变量；`secret` 为真时任何地方都不回显它的值。
 */
export interface EnvNeed extends NeedCommon {
  readonly kind: 'env';
  readonly name: string;
  readonly secret?: boolean;
}

/**
 * 模块声明的一条需要。
 */
export type Need = BinNeed | ExtensionNeed | LibNeed | EnvNeed;

/**
 * 一份 needs 校验结果：错误拒收，警告只提醒（未知可选字段就是警告）。
 */
export interface NeedsProblems {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * 协议认得的 need 字段；`x-` 前缀的字段留给第三方扩展，直接忽略。
 */
export const NEED_KEYS: readonly string[] = [
  'kind',
  'purpose',
  'required',
  'id',
  'name',
  'runtime',
  'commands',
  'version',
  'sources',
  'secret',
  'install',
  'docs',
];

/**
 * 注册表把「怎么校验、怎么探、能不能代装」收在一处；加一种 kind 只在这里加一行。
 */
export interface NeedKindSpec {
  readonly kind: NeedKind;
  readonly probe: 'bin' | 'extension' | 'package' | 'env';
  readonly sources: readonly SupplySourceKind[];
  readonly validate: (raw: Readonly<Record<string, unknown>>, at: string) => readonly string[];
}

const SOURCE_KEYS = ['kind', 'package', 'registryEnv', 'registryDefault', 'url', 'ref', 'path', 'env'];
const REGISTRY_PATTERN = /^(?:https?|file):\/\//;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 这个字符串是不是协议认得的 need 类别。
 * @param value 待判的值。
 * @returns 是就收窄成 NeedKind。
 */
export function isKnownNeedKind(value: unknown): value is NeedKind {
  return typeof value === 'string' && (NEED_KINDS as readonly string[]).includes(value);
}

/**
 * 一条 need 的稳定标识：作者写 `id` 就用它，否则 `kind:name`。
 * @param need 一条 need。
 * @returns 标识串。
 */
export function needIdOf(need: Need): string {
  return need.id === undefined || need.id.trim() === '' ? `${need.kind}:${need.name}` : need.id;
}

function sourceProblemsOf(raw: unknown, at: string): readonly string[] {
  if (!isRecord(raw)) return [`${at} 要是对象`];
  const kind = text(raw['kind']);
  if (!(SUPPLY_SOURCE_KINDS as readonly string[]).includes(kind)) {
    return [`${at}.kind 不认识 —— ${JSON.stringify(raw['kind'])}（只有 ${SUPPLY_SOURCE_KINDS.join(' / ')}）`];
  }
  const errors: string[] = [];
  for (const key of Object.keys(raw)) {
    if (SOURCE_KEYS.includes(key) || key.startsWith('x-')) continue;
    errors.push(`${at} 有不认识的字段 ${key}`);
  }
  if (kind === 'npm') {
    if (raw['package'] !== undefined && text(raw['package']) === '') errors.push(`${at}.package 是空串`);
    if (raw['registryEnv'] !== undefined && text(raw['registryEnv']) === '') {
      errors.push(`${at}.registryEnv 是空串`);
    }
    if (raw['registryDefault'] !== undefined && !REGISTRY_PATTERN.test(text(raw['registryDefault']))) {
      errors.push(`${at}.registryDefault 要是 http(s):// 或 file:// 的源地址`);
    }
    return errors;
  }
  if (kind === 'git') {
    if (text(raw['url']) === '') errors.push(`${at}.url 没写`);
    return errors;
  }
  if (text(raw['path']) === '' && text(raw['env']) === '') {
    errors.push(`${at} 是 local，但 path 与 env 都没写`);
  }
  return errors;
}

function sourcesProblemsOf(
  raw: unknown,
  at: string,
  allowed: readonly SupplySourceKind[],
): readonly string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return [`${at}.sources 要是数组`];
  if (raw.length === 0) return [`${at}.sources 是空数组 —— 不代装就整条删掉`];
  if (allowed.length === 0) {
    return [`${at} 这种需要不支持 sources —— 要代装就写 install（一条命令）`];
  }
  const errors: string[] = [];
  raw.forEach((source, index) => {
    const one = sourceProblemsOf(source, `${at}.sources[${index}]`);
    errors.push(...one);
    if (one.length === 0 && isRecord(source)) {
      const kind = text(source['kind']) as SupplySourceKind;
      if (!allowed.includes(kind)) {
        errors.push(`${at}.sources[${index}].kind 是 ${kind}，这种需要只支持 ${allowed.join(' / ')}`);
      }
    }
  });
  return errors;
}

function commonProblemsOf(raw: Readonly<Record<string, unknown>>, at: string): readonly string[] {
  const errors: string[] = [];
  if (text(raw['purpose']) === '') errors.push(`${at}.purpose 没写 —— 「为什么要它」是缺失文案的那半句`);
  if (raw['required'] !== undefined && typeof raw['required'] !== 'boolean') {
    errors.push(`${at}.required 要是布尔`);
  }
  if (raw['id'] !== undefined && text(raw['id']) === '') errors.push(`${at}.id 是空串`);
  return errors;
}

export function binInstallProblemsOf(raw: unknown, at: string): readonly string[] {
  if (raw === undefined) return [];
  if (!isRecord(raw)) return [`${at}.install 要是对象`];
  const errors: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!['kind', 'line', 'platforms', 'package', 'registryEnv', 'registryDefault'].includes(key)) {
      errors.push(`${at}.install 有不认识的字段 ${key}`);
    }
  }
  const kind = text(raw['kind']);
  if (kind !== 'command' && kind !== 'npm') {
    errors.push(`${at}.install.kind 只认 command（一条命令）或 npm（一个包，装进隔离运行时）`);
  }
  if (kind === 'command' && text(raw['line']) === '') {
    errors.push(`${at}.install.line 没写 —— 要一条能直接粘进终端的命令`);
  }
  if (kind === 'npm' && text(raw['package']) === '') {
    errors.push(`${at}.install.package 没写 —— 这个命令由哪个 npm 包提供`);
  }
  if (raw['registryDefault'] !== undefined && !REGISTRY_PATTERN.test(text(raw['registryDefault']))) {
    errors.push(`${at}.install.registryDefault 要是 http(s):// 或 file:// 的源地址`);
  }
  if (raw['platforms'] !== undefined) {
    if (!Array.isArray(raw['platforms']) || raw['platforms'].length === 0) {
      errors.push(`${at}.install.platforms 要是非空数组`);
    } else if (raw['platforms'].some((one) => !['darwin', 'linux', 'win32'].includes(text(one)))) {
      errors.push(`${at}.install.platforms 只认 darwin / linux / win32`);
    }
  }
  return errors;
}

function perKindProblemsOf(
  kind: NeedKind,
  raw: Readonly<Record<string, unknown>>,
  at: string,
): readonly string[] {
  const errors: string[] = [];
  if (kind === 'bin' || kind === 'lib' || kind === 'env') {
    if (text(raw['name']) === '') errors.push(`${at}.name 没写`);
  }
  if (kind === 'bin') errors.push(...binInstallProblemsOf(raw['install'], at));
  if (raw['docs'] !== undefined && text(raw['docs']) === '') errors.push(`${at}.docs 是空串`);
  if (kind === 'extension') {
    if (text(raw['runtime']) === '') errors.push(`${at}.runtime 没写 —— 扩展属于哪个运行时（如 opencli）`);
    if (text(raw['name']) === '') errors.push(`${at}.name 没写`);
    if (raw['commands'] !== undefined) {
      if (!Array.isArray(raw['commands'])) errors.push(`${at}.commands 要是数组`);
      else if (raw['commands'].some((one) => text(one) === '')) errors.push(`${at}.commands 里有空字符串`);
    }
  }
  if (kind === 'env' && raw['secret'] !== undefined && typeof raw['secret'] !== 'boolean') {
    errors.push(`${at}.secret 要是布尔`);
  }
  return errors;
}

function validateKind(kind: NeedKind) {
  return (raw: Readonly<Record<string, unknown>>, at: string): readonly string[] =>
    perKindProblemsOf(kind, raw, at);
}

/**
 * 一张表说了算：每种 kind 的探法、可用来源与校验。
 */
export const NEED_KIND_SPECS: Readonly<Record<NeedKind, NeedKindSpec>> = Object.freeze({
  bin: Object.freeze({
    kind: 'bin',
    probe: 'bin',
    sources: Object.freeze([]) as readonly SupplySourceKind[],
    validate: validateKind('bin'),
  }),
  extension: Object.freeze({
    kind: 'extension',
    probe: 'extension',
    sources: Object.freeze(['npm', 'git', 'local'] as SupplySourceKind[]),
    validate: validateKind('extension'),
  }),
  lib: Object.freeze({
    kind: 'lib',
    probe: 'package',
    sources: Object.freeze(['npm'] as SupplySourceKind[]),
    validate: validateKind('lib'),
  }),
  env: Object.freeze({
    kind: 'env',
    probe: 'env',
    sources: Object.freeze([]) as readonly SupplySourceKind[],
    validate: validateKind('env'),
  }),
});

/**
 * 校验一条 need；未知类别是错误，未知字段是警告。
 * @param label 报错时用的主语（模块包名）。
 * @param raw 这一条 need 的原始值。
 * @param index 它在 needs 里的下标。
 * @returns 错误与警告。
 */
export function needProblemsOf(label: string, raw: unknown, index: number): NeedsProblems {
  const at = `${label}.needs[${index}]`;
  if (!isRecord(raw)) return { errors: [`${at} 要是对象`], warnings: [] };
  const kind = text(raw['kind']);
  if (!isKnownNeedKind(kind)) {
    return {
      errors: [
        `${at}.kind 不认识 —— ${JSON.stringify(raw['kind'])}（v2 只认 ${NEED_KINDS.join(' / ')}；` +
          '要是模块用了更新的工作台才有的种类，升级工作台）',
      ],
      warnings: [],
    };
  }
  const warnings: string[] = [];
  for (const key of Object.keys(raw)) {
    if (NEED_KEYS.includes(key) || key.startsWith('x-')) continue;
    warnings.push(`${at} 有不认识的字段 ${key}（宿主会忽略它）`);
  }
  const errors = [
    ...commonProblemsOf(raw, at),
    ...perKindProblemsOf(kind, raw, at),
    ...sourcesProblemsOf(raw['sources'], at, NEED_KIND_SPECS[kind].sources),
  ];
  return { errors, warnings };
}

/**
 * 校验整张 needs 表（没写就是空表）。
 * @param label 报错时用的主语。
 * @param raw 声明里的 needs 原始值。
 * @returns 错误与警告。
 */
export function needsProblemsOf(label: string, raw: unknown): NeedsProblems {
  if (raw === undefined) return { errors: [], warnings: [] };
  if (!Array.isArray(raw)) return { errors: [`${label}.needs 要是数组`], warnings: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  raw.forEach((one, index) => {
    const found = needProblemsOf(label, one, index);
    errors.push(...found.errors);
    warnings.push(...found.warnings);
    if (found.errors.length > 0 || !isRecord(one)) return;
    const kind = text(one['kind']);
    const id = text(one['id']) === '' ? `${kind}:${text(one['name'])}` : text(one['id']);
    if (seen.has(id)) errors.push(`${label}.needs 里 ${id} 重复了 —— 每条 need 的 id 要唯一`);
    seen.add(id);
  });
  return { errors, warnings };
}
