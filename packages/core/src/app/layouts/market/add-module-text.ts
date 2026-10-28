import type { Translate } from '@dsh-workbench/shared';
import type {
  BundleChange,
  BundleInspectProblem,
  BundleInspectionAccepted,
  BundleInspectionPlugin,
  BundleRegistries,
  RestartReason,
} from '@/kernel/contract/bundle-install';

export type AddModulePhase = 'idle' | 'inspecting' | 'preview' | 'installing' | 'result';

export interface AddModulePreview {
  readonly kind: 'module' | 'plugin';
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly registry: string;
  readonly pluginName?: string;
}

export function previewOf(
  inspection: BundleInspectionAccepted | BundleInspectionPlugin,
  fallback: string,
): AddModulePreview {
  if (inspection.status === 'plugin') {
    return {
      kind: 'plugin',
      name: inspection.pkg,
      version: inspection.version ?? '',
      description: '',
      registry: inspection.registry ?? '',
      ...(inspection.pluginName === undefined ? {} : { pluginName: inspection.pluginName }),
    };
  }
  return {
    kind: 'module',
    name: inspection.name ?? fallback,
    version: inspection.version ?? '',
    description: inspection.description ?? '',
    registry: inspection.registry ?? '',
  };
}

export type AddModuleResultKind =
  | 'plugin'
  | 'failed'
  | 'cancelled'
  | 'restart'
  | 'took-effect'
  | 'quiet';

export function resultKindOf(input: {
  readonly change: Pick<BundleChange, 'application'>;
  readonly supplyState: string;
  readonly plugin: boolean;
}): AddModuleResultKind {
  if (input.plugin) return 'plugin';
  if (input.change.application === 'failed') return 'failed';
  if (input.change.application === 'restart-required') return 'restart';
  if (input.change.application === 'cancelled' || input.supplyState === 'not-a-module') return 'quiet';
  return 'took-effect';
}

export type RegistryKind = 'default' | 'url' | 'custom';

export interface RegistryChoice {
  readonly kind: RegistryKind;
  readonly value: string;
}

export interface RegistryOption {
  readonly choice: RegistryChoice;
  readonly host?: string;
  readonly nameKey?: string;
}

export interface GuideItem {
  readonly titleKey: string;
  readonly exampleKey: string;
  readonly hintKey: string;
}

export const GUIDE_ITEMS: readonly GuideItem[] = [
  {
    titleKey: 'panels.market.add.guideIdTitle',
    exampleKey: 'panels.market.add.guideIdExample',
    hintKey: 'panels.market.add.guideIdHint',
  },
  {
    titleKey: 'panels.market.add.guideGitTitle',
    exampleKey: 'panels.market.add.guideGitExample',
    hintKey: 'panels.market.add.guideGitHint',
  },
  {
    titleKey: 'panels.market.add.guidePathTitle',
    exampleKey: 'panels.market.add.guidePathExample',
    hintKey: 'panels.market.add.guidePathHint',
  },
];

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const OFFICIAL_NPM_HOST = 'registry.npmjs.org';

const KNOWN_HOSTS: Readonly<Record<string, string>> = {
  [OFFICIAL_NPM_HOST]: 'panels.market.add.registryOfficial',
  'registry.npmmirror.com': 'panels.market.add.registryMirror',
};

export function registryNameKey(host: string): string | undefined {
  return KNOWN_HOSTS[host];
}

function normalizeRegistry(url: string): string {
  const parsed = new URL(url);
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed.href;
}

function registryKey(url: string | null, resolved: string | null): string {
  const target = url ?? resolved;
  if (target === null) return '';
  try {
    return normalizeRegistry(target);
  } catch {
    return target;
  }
}

export function registryOptions(registries: BundleRegistries | null): readonly RegistryOption[] {
  const resolved = registries === null ? null : registries.resolved;
  const entries: readonly (string | null)[] = [
    registries === null ? null : registries.registry,
    ...(registries === null ? [] : registries.fallbackRegistries),
    null,
  ];
  const offered: RegistryOption[] = [];
  const keys = new Set<string>();
  for (const entry of entries) {
    const key = registryKey(entry, resolved);
    if (keys.has(key)) continue;
    keys.add(key);
    const url = entry ?? resolved;
    if (url === null) {
      offered.push({
        choice: { kind: 'default', value: '' },
        host: OFFICIAL_NPM_HOST,
        nameKey: 'panels.market.add.registryDefault',
      });
      continue;
    }
    const host = hostOf(url);
    const nameKey = registryNameKey(host);
    offered.push({
      choice: entry === null ? { kind: 'default', value: '' } : { kind: 'url', value: entry },
      host,
      ...(nameKey === undefined ? {} : { nameKey }),
    });
  }
  offered.push({ choice: { kind: 'custom', value: '' } });
  return offered;
}

export function customRegistryAllowed(value: string): boolean {
  return /^https?:\/\//.test(value.trim());
}

export function registryOf(choice: RegistryChoice, custom: string): string | undefined {
  if (choice.kind === 'custom') return customRegistryAllowed(custom) ? custom.trim() : undefined;
  return choice.value === '' ? undefined : choice.value;
}

export function registryName(option: RegistryOption, t: Translate): string {
  if (option.choice.kind === 'custom') return t('panels.market.add.registryCustom');
  if (option.nameKey !== undefined) return t(option.nameKey);
  return option.host ?? t('panels.market.add.registryDefault');
}

export function optionLabel(option: RegistryOption, t: Translate): string {
  if (option.choice.kind === 'custom') return t('panels.market.add.registryCustom');
  if (option.host === undefined) return t('panels.market.add.registryDefault');
  return option.nameKey === undefined
    ? option.host
    : t('panels.market.add.registryWithHost', { name: t(option.nameKey), host: option.host });
}

const PROBLEM_KEYS: Readonly<Record<BundleInspectProblem, string>> = {
  'invalid-spec': 'panels.market.add.problemInvalid',
  'already-installed': 'panels.market.add.problemInstalled',
  'not-found': 'panels.market.add.problemNotFound',
  'not-a-package': 'panels.market.add.problemNotPackage',
  'not-a-bundle': 'panels.market.add.problemNotBundle',
  'not-a-workbench-module': 'panels.market.add.problemNotWorkbenchModule',
  'not-a-module-or-plugin': 'panels.market.add.problemNotModuleOrPlugin',
  network: 'panels.market.add.problemNetwork',
  unknown: 'panels.market.add.problemUnknown',
};

export function problemKey(problem: BundleInspectProblem): string {
  return PROBLEM_KEYS[problem] ?? PROBLEM_KEYS.unknown;
}

export function heldWizardPhase(phase: AddModulePhase, classifying: boolean): AddModulePhase {
  return classifying && (phase === 'preview' || phase === 'idle') ? 'inspecting' : phase;
}

const CREDENTIAL_TEXT =
  /authentication failed|could not read (username|password)|permission denied \(publickey\)|terminal prompts disabled|host key verification failed|repository not found|no such identity/i;

const FAILURE_KEYS: Readonly<Record<string, string>> = {
  credentials: 'panels.market.add.failureCredentials',
  network: 'panels.market.add.failureNetwork',
  'spec-host': 'panels.market.add.failureNetworkHost',
  'not-found': 'panels.market.add.failureNotFound',
  'no-matching-version': 'panels.market.add.failureNoMatchingVersion',
  'not-a-module-or-plugin': 'panels.market.add.failureNotModuleOrPlugin',
  'disk-full': 'panels.market.add.failureDiskFull',
  permission: 'panels.market.add.failurePermission',
  'build-blocked': 'panels.market.add.failureBuildBlocked',
  integrity: 'panels.market.add.failureIntegrity',
  timeout: 'panels.market.add.failureTimeout',
  'pnpm-missing': 'panels.market.add.failurePnpmMissing',
  'already-installed': 'panels.market.add.failureInstalled',
  'operation-error': 'panels.market.add.failureGeneric',
  'incompatible-version': 'panels.market.add.failureGeneric',
  'not-bundle': 'panels.market.add.failureGeneric',
  'invalid-spec': 'panels.market.add.failureGeneric',
  'bundle-in-use': 'panels.market.add.failureStopProfile',
  'not-removable': 'panels.market.add.failureGeneric',
  'stop-profile': 'panels.market.add.failureStopProfile',
  cancelled: 'panels.market.add.failureCancelled',
  'stale-approval': 'panels.market.add.failureGeneric',
};

function needsCredentials(change: BundleChange): boolean {
  const text = `${change.errorDetail ?? ''}\n${change.packageResult?.output ?? ''}`;
  return CREDENTIAL_TEXT.test(text);
}

export function failureCode(change: BundleChange): string {
  if (change.failedAt === 'spec-host') return 'spec-host';
  const code = change.errorCode ?? change.packageResult?.kind ?? change.application;
  if (code === 'operation-error' && needsCredentials(change)) return 'credentials';
  return code;
}

export function failureReasonKey(code: string): string | undefined {
  return FAILURE_KEYS[code];
}

export function failureReason(code: string, application: string, t: Translate): string {
  const key = failureReasonKey(code);
  if (key !== undefined) return t(key);
  if (code === application) return t('panels.market.add.reason.unknown');
  return code;
}

const SUPPLY_KEYS: Readonly<Record<string, string | undefined>> = {
  'pending-restart': 'panels.market.add.supplyPending',
  failed: 'panels.market.add.supplyFailed',
  'not-a-module': 'panels.market.add.notModule',
  'no-needs': undefined,
};

export function supplyKey(state: string): string | undefined {
  return SUPPLY_KEYS[state];
}

export function restartWhyKey(reason: RestartReason | undefined): string | undefined {
  return reason === undefined ? undefined : `panels.market.add.restartWhy.${reason}`;
}

export function restartWhy(change: BundleChange, t: Translate): string | undefined {
  const key = restartWhyKey(change.restartReason);
  if (key === undefined) return undefined;
  return t('panels.market.add.restartWhy', { reason: t(key) });
}

export function verdictKey(change: BundleChange): string {
  if (change.stage === 'remove') {
    return change.application === 'restart-required'
      ? 'panels.market.add.removedRestart'
      : 'panels.market.add.removed';
  }
  if (change.application === 'applied') return 'panels.market.add.doneApplied';
  if (change.application === 'restart-required') return 'panels.market.add.doneRestart';
  if (change.application === 'cancelled') return 'panels.market.add.cancelled';
  return 'panels.market.add.failed';
}
