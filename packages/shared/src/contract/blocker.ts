/**
 * 卡住时用户能点的那一下（开链接 / 复制命令 / 重试 / 装或升模块）：由判据产出，卡片照原样渲染。
 */
export type BlockerAction =
  | {
      readonly kind: 'open-url';
      readonly label: string;
      readonly url: string;
      readonly inline?: boolean;
    }
  | { readonly kind: 'copy'; readonly label: string; readonly text: string }
  | { readonly kind: 'ask-agent'; readonly label: string; readonly prompt: string }
  | { readonly kind: 'retry'; readonly label: string }
  | {
      readonly kind: 'run-fix';
      readonly label: string;
      readonly unit: string;
      readonly fix: 'install' | 'update';
    }
  | { readonly kind: 'open-market'; readonly label: string; readonly unit: string };

/**
 * 一个单元此刻的卡住态：block 顶掉整张卡片，notice 只在角上提示一句；读口与探针产出，卡片消费。
 */
export interface ModuleBlocker {
  readonly id: string;
  readonly severity: 'block' | 'notice';
  readonly title: string;
  readonly hint?: string;
  readonly detail?: string;
  readonly actions: readonly BlockerAction[];
}

export type DiagClass = 'user' | 'env' | 'bug';

export type DiagArea =
  | 'panels'
  | 'market'
  | 'supply'
  | 'preflight'
  | 'self-update'
  | 'settings'
  | 'diag';

export type DiagActionKind = BlockerAction['kind'] | 'open-settings';

export type DiagLevel = 'info' | 'warn' | 'error';

export interface DiagCodeSpec {
  readonly code: string;
  readonly class: DiagClass;
  readonly area: DiagArea;
  readonly action: DiagActionKind;
  readonly messageKey: string;
  readonly hintKey?: string;
}

export const DIAG_CLASSES: readonly DiagClass[] = ['user', 'env', 'bug'];

export const DIAG_AREAS: readonly DiagArea[] = [
  'panels',
  'market',
  'supply',
  'preflight',
  'self-update',
  'settings',
  'diag',
];

export const DIAG_ACTIONS: readonly DiagActionKind[] = [
  'open-url',
  'copy',
  'retry',
  'run-fix',
  'open-market',
  'open-settings',
];

export const DIAG_LEVELS: readonly DiagLevel[] = ['info', 'warn', 'error'];

function keyOf(code: string): string {
  return code
    .replace(/^DIAG_/, '')
    .toLowerCase()
    .replace(/_([a-z])/g, (_all, letter: string) => letter.toUpperCase());
}

function specOfCode(init: {
  readonly code: string;
  readonly class: DiagClass;
  readonly area: DiagArea;
  readonly action: DiagActionKind;
  readonly hint?: boolean;
}): DiagCodeSpec {
  const key = keyOf(init.code);
  return {
    code: init.code,
    class: init.class,
    area: init.area,
    action: init.action,
    messageKey: `diag.code.${key}`,
    ...(init.hint === true ? { hintKey: `diag.hint.${key}` } : {}),
  };
}

const envOf = (code: string, area: DiagArea, hint = false): DiagCodeSpec =>
  specOfCode({ code, class: 'env', area, action: 'retry', hint });

const userOf = (code: string, area: DiagArea, action: DiagActionKind): DiagCodeSpec =>
  specOfCode({ code, class: 'user', area, action });

const bugOf = (code: string, area: DiagArea, hint = false): DiagCodeSpec =>
  specOfCode({ code, class: 'bug', area, action: 'retry', hint });

export const DIAG_CODES: readonly DiagCodeSpec[] = [
  envOf('READ_FAILED', 'panels', true),
  envOf('ACTION_FAILED', 'diag', true),
  bugOf('CLIENT_FAILED', 'panels', true),
  userOf('CONFIG_CORRUPT', 'settings', 'open-settings'),
  userOf('MODULE_UNREADABLE', 'market', 'open-settings'),
  envOf('MANIFESTS_GAVE_UP', 'panels'),
  envOf('SELF_UPDATE_FAILED', 'self-update'),
  envOf('SUPPLY_INSTALL_FAILED', 'supply'),
  envOf('PREFLIGHT_DIY_ROW_BROKEN', 'preflight', true),
  envOf('PREFLIGHT_DIY_PRESET_MISSING', 'preflight', true),
  envOf('PREFLIGHT_BRIDGE_HOLD', 'preflight', true),
  envOf('PREFLIGHT_HOST_OLDER', 'preflight', true),
  envOf('PREFLIGHT_HOST_NEWER', 'preflight', true),
  userOf('DIAG_BAD_PARAM', 'diag', 'retry'),
  bugOf('DIAG_SINK_FAILED', 'diag'),
  bugOf('DIAG_UNKNOWN_CODE', 'diag'),
];

export interface DiagFilter {
  readonly since?: number;
  readonly until?: number;
  readonly area?: DiagArea;
  readonly class?: DiagClass;
  readonly code?: string;
  readonly host?: string;
}

export function diagMatches(
  record: {
    readonly ts: number;
    readonly area: DiagArea;
    readonly class: DiagClass;
    readonly code: string;
    readonly host?: { readonly profile?: string } | undefined;
  },
  filter: DiagFilter,
): boolean {
  return (
    (filter.since === undefined || record.ts >= filter.since) &&
    (filter.until === undefined || record.ts <= filter.until) &&
    (filter.area === undefined || record.area === filter.area) &&
    (filter.class === undefined || record.class === filter.class) &&
    (filter.code === undefined || record.code === filter.code) &&
    (filter.host === undefined || filter.host === '*' || (record.host?.profile ?? 'unknown') === filter.host)
  );
}

export const DIAG_FALLBACK_CODE = 'DIAG_UNKNOWN_CODE';

const BY_CODE = new Map(DIAG_CODES.map((spec) => [spec.code, spec]));

export function diagSpecOf(code: string): DiagCodeSpec | undefined {
  return BY_CODE.get(code);
}

export function isDiagCode(code: string): boolean {
  return BY_CODE.has(code);
}

const DETAIL_KEYS_STEP: readonly string[] = [
  'action',
  'attempt',
  'cacheAgeMs',
  'count',
  'durationMs',
  'fromVersion',
  'phase',
  'requestedCode',
  'route',
  'stage',
  'toVersion',
  'truncated',
];

const DETAIL_KEYS_SUBJECT: readonly string[] = ['os', 'path', 'pid', 'pkg', 'reason', 'unit', 'version', 'workspace'];

const DETAIL_KEYS_PREFLIGHT: readonly string[] = ['issues', 'rows', 'runtime', 'tier', 'verified'];

const DETAIL_KEYS_SINK: readonly string[] = ['since', 'sink', 'wroteBytes'];

export const DIAG_DETAIL_KEYS: readonly string[] = [
  ...DETAIL_KEYS_STEP,
  ...DETAIL_KEYS_SUBJECT,
  ...DETAIL_KEYS_PREFLIGHT,
  ...DETAIL_KEYS_SINK,
];
