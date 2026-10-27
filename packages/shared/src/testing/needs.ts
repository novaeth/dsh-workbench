import type {
  BinNeed,
  EnvNeed,
  ExtensionNeed,
  LibNeed,
  Need,
  NeedKind,
  SupplySource,
} from '../contract/needs.js';
import type { NeedState } from '../contract/unit-capability.js';
import type { UnitCapability } from '../contract/unit-capability.js';
import type { UnitManifest } from '../contract/unit.js';
import { unitTitleKey } from '../contract/unit.js';

export const fakeNpmSource: SupplySource = {
  kind: 'npm',
  registryEnv: 'WB_TEST_REGISTRY',
  registryDefault: 'https://registry.invalid/',
};

export function extensionNeedOf(name: string, extra: Partial<ExtensionNeed> = {}): ExtensionNeed {
  return {
    kind: 'extension',
    runtime: 'opencli',
    name,
    commands: [`${name}-read`],
    purpose: '测试',
    ...extra,
  };
}

export function libNeedOf(name: string, extra: Partial<LibNeed> = {}): LibNeed {
  return { kind: 'lib', name, purpose: '测试', ...extra };
}

export function binNeedOf(name: string, extra: Partial<BinNeed> = {}): BinNeed {
  return { kind: 'bin', name, purpose: '测试', ...extra };
}

export function envNeedOf(name: string, extra: Partial<EnvNeed> = {}): EnvNeed {
  return { kind: 'env', name, purpose: '测试', ...extra };
}

export function manifestOf(
  options: {
    readonly id?: string | undefined;
    readonly needs?: readonly Need[] | undefined;
    readonly card?: UnitManifest['card'];
  } = {},
): UnitManifest {
  const id = options.id ?? 'fixture';
  return {
    id,
    titleKey: unitTitleKey(id),
    card: options.card === undefined ? { order: 10 } : options.card,
    tools: [],
    host: { inject: [] },
    ...(options.needs === undefined ? {} : { needs: options.needs }),
  };
}

export function needStateOf(
  need: Need,
  status: NeedState['status'] = 'ok',
  extra: Partial<NeedState> = {},
): NeedState {
  return {
    id: need.id ?? `${need.kind}:${need.name}`,
    kind: need.kind as NeedKind,
    name: need.name,
    status,
    detail: `测试：${need.name}`,
    ...extra,
  };
}

export function capabilityOf(
  unit: string,
  needs: readonly NeedState[] = [],
  extra: Partial<UnitCapability> = {},
): UnitCapability {
  return { unit, status: needs.some((need) => need.status !== 'ok') ? 'missing' : 'ok', needs, ...extra };
}
