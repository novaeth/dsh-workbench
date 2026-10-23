import type { UnitCapability } from '@/shared/api/host/probe-units';
import { isDependencyAction, type ProvisionRequest } from '@dsh-workbench/shared/host';
import type { UnitLibNeed, UnitManifest } from '@dsh-workbench/shared/host';
import { resolvePluginSource, type PluginSourceCommand, type PluginSourceProblem } from '@dsh-workbench/shared/host';
import { isNewerVersion } from '@/shared/api/host/release';
import { libInstallCommand } from '@dsh-workbench/shared/host';
import { quoteShellArg } from '@dsh-workbench/shared/host';

export type DependencyKind = 'plugin' | 'lib';

export interface SharedDependency {
  readonly id: string;
  readonly kind: DependencyKind;
  readonly name: string;
  readonly status: 'ok' | 'outdated' | 'unsatisfied' | 'missing' | 'unchecked';
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
}

export function dependencyId(kind: DependencyKind, name: string): string {
  return `${kind}:${name}`;
}

export function parseDependencyId(id: string): { readonly kind: DependencyKind; readonly name: string } | undefined {
  const at = id.indexOf(':');
  if (at <= 0) return undefined;
  const kind = id.slice(0, at);
  const name = id.slice(at + 1).trim();
  if ((kind !== 'plugin' && kind !== 'lib') || name === '') return undefined;
  return { kind, name };
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
  const declarers = manifests.filter((manifest) =>
    parsed.kind === 'plugin'
      ? (manifest.env?.plugins ?? []).some((need) => need.name === parsed.name)
      : (manifest.env?.libs ?? []).some((need) => need.name === parsed.name),
  );
  if (declarers.length === 0) return undefined;
  return {
    id: dependencyId(parsed.kind, parsed.name),
    kind: parsed.kind,
    name: parsed.name,
    declarers,
    users: declarers.filter((manifest) => !(isReleased?.(manifest.id) ?? false)),
  };
}

function dependencyNamesOf(manifest: UnitManifest): readonly string[] {
  return [
    ...(manifest.env?.plugins ?? []).map((need) => need.name),
    ...(manifest.env?.libs ?? []).map((need) => need.name),
  ];
}

export function affectedUnitsOf(
  manifests: readonly UnitManifest[],
  request: ProvisionRequest,
): readonly string[] {
  const catalog = manifests.filter((manifest) => dependencyNamesOf(manifest).length > 0);
  if (isDependencyAction(request.action)) {
    const target = findDependency(catalog, request.id ?? '');
    return target === undefined ? [] : target.declarers.map((manifest) => manifest.id);
  }
  const unit = request.unit ?? '';
  const manifest = catalog.find((item) => item.id === unit);
  if (manifest === undefined) return [];
  const names = new Set(dependencyNamesOf(manifest));
  const sharing = catalog.filter(
    (item) => item.id !== unit && dependencyNamesOf(item).some((name) => names.has(name)),
  );
  return [...new Set([unit, ...sharing.map((item) => item.id)])];
}

const RANK: Readonly<Record<SharedDependency['status'], number>> = {
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
  readonly statuses: SharedDependency['status'][];
  installed?: string;
  latest?: string;
}

function record(
  bucket: Bucket,
  state: { status: 'ok' | 'outdated' | 'unsatisfied' | 'missing' } | undefined,
): void {
  bucket.statuses.push(state?.status ?? 'unchecked');
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
    for (const need of manifest.env?.plugins ?? []) {
      const bucket = bucketOf('plugin', need.name);
      if (!released) bucket.users.push(manifest.id);
      const state = capability?.plugins?.find((item) => item.name === need.name);
      record(bucket, state);
      if (state?.release !== undefined) {
        bucket.installed ??= state.release.installed;
        bucket.latest ??= state.release.latest;
      }
    }
    for (const need of manifest.env?.libs ?? []) {
      const bucket = bucketOf('lib', need.name, need.purpose);
      if (!released) bucket.users.push(manifest.id);
      const state = capability?.libs?.find((item) => item.name === need.name);
      record(bucket, state);
      bucket.installed ??= state?.installed;
      bucket.latest ??= state?.latest;
    }
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.users.length > 0)
    .map((bucket) => {
      const worst = bucket.statuses.reduce<SharedDependency['status']>(
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

export type DependencyPlan = readonly PluginSourceCommand[] | undefined;

function libNeedOf(target: DependencyTarget): UnitLibNeed | undefined {
  for (const manifest of target.declarers) {
    const need = (manifest.env?.libs ?? []).find((item) => item.name === target.name);
    if (need !== undefined) return need;
  }
  return undefined;
}

export function dependencyCommandPlan(options: {
  readonly target: DependencyTarget;
  readonly capability: UnitCapability | undefined;
  readonly capabilities?: ReadonlyMap<string, UnitCapability> | undefined;
  readonly command: string;
}): DependencyPlan {
  const { target, capability, capabilities, command } = options;

  if (target.kind === 'plugin') {
    let outdated = false;
    for (const manifest of target.declarers) {
      const need = (manifest.env?.plugins ?? []).find((item) => item.name === target.name);
      if (need === undefined) continue;
      const seen = (capabilities?.get(manifest.id) ?? capability)?.plugins?.find(
        (item) => item.name === target.name,
      );
      if (seen?.status !== 'outdated') continue;
      outdated = true;
      const release = seen.release;
      const latest = release?.latest;
      if (release === undefined || latest === undefined || !isNewerVersion(latest, release.installed))
        continue;
      const upgrade = resolvePluginSource(need.installSource, process.env, {
        command,
        plugin: target.name,
        version: latest,
        mode: 'update',
      });
      if (upgrade.ok === true) return upgrade.commands;
    }
    return outdated
      ? [{ line: `${quoteShellArg(command)} plugin update ${quoteShellArg(target.name)}` }]
      : undefined;
  }


  const need = libNeedOf(target);
  if (need === undefined) return undefined;
  const state = capability?.libs?.find((item) => item.name === target.name);
  if (state === undefined || (state.status !== 'outdated' && state.status !== 'unsatisfied')) {
    return undefined;
  }
  return [
    {
      line: libInstallCommand({
        need,
        ...(state.status === 'outdated' && state.latest !== undefined ? { version: state.latest } : {}),
      }),
    },
  ];
}

export function sourceProblemText(problem: PluginSourceProblem, env: string | undefined): string {
  if (problem === 'env-missing') {
    return (
      `这份安装的来源写在环境变量 ${env} 里，而它没设。` +
      `在启动工作台的终端里 export ${env}=<那个值（本机路径或 npm 源地址）>，重开一次工作台即可。`
    );
  }
  if (problem === 'malformed') {
    return '这份安装的方式写得不完整（等于没声明）—— 只能自己动手。';
  }
  return '这份安装没声明安装方式 —— 没声明就不猜地址，只能自己动手。';
}
