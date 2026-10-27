import type {
  Need,
  NeedState,
  ProvisionProblem,
  SupplySource,
  UnitCapability,
  UnitManifest,
} from '@dsh-workbench/shared/host';
import { buildSupplyIndex, needIdOf, needsOf } from '@dsh-workbench/shared/host';

export const DEPENDENCY_KINDS = ['extension', 'lib'] as const;

export type DependencyKind = (typeof DEPENDENCY_KINDS)[number];

export interface SharedDependency {
  readonly id: string;
  readonly kind: DependencyKind;
  readonly name: string;
  readonly status: NeedState['status'];
  readonly installed?: string;
  readonly latest?: string;
  readonly purpose?: string;
  readonly usedBy: readonly string[];
}

export interface DependencyTarget {
  readonly id: string;
  readonly kind: DependencyKind;
  readonly name: string;
  readonly declarers: readonly UnitManifest[];
  readonly users: readonly UnitManifest[];
  readonly sources?: readonly SupplySource[];
  readonly conflict?: string;
}

export function dependencyId(kind: DependencyKind, name: string): string {
  return `${kind}:${name}`;
}

export function parseDependencyId(
  id: string,
): { readonly kind: DependencyKind; readonly name: string } | undefined {
  const at = id.indexOf(':');
  if (at <= 0) return undefined;
  const kind = id.slice(0, at);
  const name = id.slice(at + 1).trim();
  if (!(DEPENDENCY_KINDS as readonly string[]).includes(kind) || name === '') return undefined;
  return { kind: kind as DependencyKind, name };
}

function needsFor(manifest: UnitManifest, kind: DependencyKind, name: string): readonly Need[] {
  return needsOf(manifest).filter((need) => need.kind === kind && need.name === name);
}

function releasedOf(
  manifest: UnitManifest,
  capability: UnitCapability | undefined,
  isReleased: ((unit: string) => boolean) | undefined,
): boolean {
  return isReleased !== undefined ? isReleased(manifest.id) : capability?.released === true;
}

export function findDependency(
  manifests: readonly UnitManifest[],
  id: string,
  isReleased?: ((unit: string) => boolean) | undefined,
): DependencyTarget | undefined {
  const parsed = parseDependencyId(id);
  if (parsed === undefined) return undefined;
  const declarers = manifests.filter((manifest) => needsFor(manifest, parsed.kind, parsed.name).length > 0);
  if (declarers.length === 0) return undefined;
  const index = buildSupplyIndex(
    manifests.map((manifest) => ({ id: manifest.id, needs: needsOf(manifest) })),
    { env: process.env },
  );
  const entry =
    parsed.kind === 'extension' || parsed.kind === 'lib' ? index.entryOf(parsed.kind, parsed.name) : undefined;
  const conflict =
    entry?.conflicted === true
      ? index.conflicts.find((item) => item.names.includes(parsed.name))?.detail
      : undefined;
  return {
    id: dependencyId(parsed.kind, parsed.name),
    kind: parsed.kind,
    name: parsed.name,
    declarers,
    users: declarers.filter((manifest) => !(isReleased?.(manifest.id) ?? false)),
    ...(entry === undefined ? {} : { sources: entry.conflicted ? [] : entry.sources }),
    ...(conflict === undefined ? {} : { conflict }),
  };
}

function dependencyIdsOf(manifest: UnitManifest): readonly string[] {
  return needsOf(manifest).map((need) => needIdOf(need));
}

export function affectedUnitsOf(
  manifests: readonly UnitManifest[],
  request: { readonly id?: string | undefined; readonly unit?: string | undefined },
): readonly string[] {
  if (request.id !== undefined) {
    const target = findDependency(manifests, request.id);
    return target === undefined ? [] : target.declarers.map((manifest) => manifest.id);
  }
  const unit = request.unit ?? '';
  const manifest = manifests.find((item) => item.id === unit);
  if (manifest === undefined) return [];
  const ids = new Set(dependencyIdsOf(manifest));
  const sharing = manifests.filter(
    (item) => item.id !== unit && dependencyIdsOf(item).some((id) => ids.has(id)),
  );
  return [...new Set([unit, ...sharing.map((item) => item.id)])];
}

const RANK: Readonly<Record<NeedState['status'], number>> = {
  unchecked: 0,
  ok: 1,
  outdated: 2,
  unsatisfied: 3,
  missing: 4,
};

interface Bucket {
  readonly kind: DependencyKind;
  readonly name: string;
  purpose?: string;
  readonly users: string[];
  readonly statuses: NeedState['status'][];
  installed?: string;
  latest?: string;
}

export function sharedDependencies(options: {
  readonly manifests: readonly UnitManifest[];
  readonly capabilities: ReadonlyMap<string, UnitCapability>;
  readonly isReleased?: ((unit: string) => boolean) | undefined;
}): SharedDependency[] {
  const { manifests, capabilities, isReleased } = options;
  const buckets = new Map<string, Bucket>();
  const bucketOf = (kind: DependencyKind, name: string, purpose?: string): Bucket => {
    const id = dependencyId(kind, name);
    const found = buckets.get(id);
    if (found !== undefined) {
      if (found.purpose === undefined && purpose !== undefined) found.purpose = purpose;
      return found;
    }
    const created: Bucket = { kind, name, users: [], statuses: [], ...(purpose === undefined ? {} : { purpose }) };
    buckets.set(id, created);
    return created;
  };

  for (const manifest of manifests) {
    const capability = capabilities.get(manifest.id);
    const released = releasedOf(manifest, capability, isReleased);
    for (const need of needsOf(manifest)) {
      if (need.kind !== 'extension' && need.kind !== 'lib') continue;
      const id = needIdOf(need);
      const bucket = bucketOf(need.kind, need.name, need.purpose);
      if (!released) bucket.users.push(manifest.id);
      const state = capability?.needs.find((item) => item.id === id);
      bucket.statuses.push(state?.status ?? 'unchecked');
      if (state?.installed !== undefined) bucket.installed ??= state.installed;
      if (state?.latest !== undefined) bucket.latest ??= state.latest;
    }
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.users.length > 0)
    .map((bucket) => {
      const worst = bucket.statuses.reduce<NeedState['status']>(
        (soFar, status) => (RANK[status] > RANK[soFar] ? status : soFar),
        'unchecked',
      );
      return {
        id: dependencyId(bucket.kind, bucket.name),
        kind: bucket.kind,
        name: bucket.name,
        status: worst,
        ...(bucket.installed === undefined ? {} : { installed: bucket.installed }),
        ...(bucket.latest === undefined ? {} : { latest: bucket.latest }),
        ...(bucket.purpose === undefined ? {} : { purpose: bucket.purpose }),
        usedBy: [...bucket.users],
      };
    });
}

export type DependencyPlan = readonly { readonly line: string; readonly optional?: true }[] | undefined;

export function dependencyCommandPlan(options: {
  readonly target: DependencyTarget;
  readonly capability: UnitCapability | undefined;
  readonly capabilities?: ReadonlyMap<string, UnitCapability> | undefined;
}): DependencyPlan {
  const { target, capability, capabilities } = options;
  if (target.conflict !== undefined) return undefined;
  for (const manifest of target.declarers) {
    const seen = capabilities?.get(manifest.id) ?? capability;
    const state = seen?.needs.find((item) => item.kind === target.kind && item.name === target.name);
    if (state === undefined || state.command === undefined) continue;
    if (state.status === 'missing' || state.status === 'ok') continue;
    return [{ line: state.command }];
  }
  return undefined;
}

export function sourceProblemText(problem: ProvisionProblem, env: string | undefined): string {
  if (problem === 'env-missing') {
    const where = env === undefined || env === '' ? '一个环境变量' : `环境变量 ${env}`;
    const value = env === undefined || env === '' ? '<那个值（本机路径或 npm 源地址）>' : `${env}=<那个值（本机路径或 npm 源地址）>`;
    return (
      `这份安装的来源写在${where === '一个环境变量' ? where : ` ${where}`} 里，而它没设。` +
      `在启动工作台的终端里 export ${value}，重开一次工作台即可。`
    );
  }
  if (problem === 'malformed') {
    return '这份安装的方式写得不完整（等于没声明）—— 只能自己动手。';
  }
  return '这份安装没声明安装方式 —— 没声明就不猜地址，只能自己动手。';
}
