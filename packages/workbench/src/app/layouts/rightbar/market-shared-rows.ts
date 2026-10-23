import type { UnitManifest } from '@dsh-workbench/shared';
import type { CapabilityMap } from '@/shared/hooks/use-capabilities';
import type { MarketRowAction } from './market-row-types';

export type SharedState =
  | 'checking'
  | 'installed'
  | 'outdated'
  | 'unsatisfied'
  | 'missing'
  | 'unchecked';

export const SHARED_STATE_KEY: Readonly<Record<SharedState, string>> = {
  checking: 'panels.market.checking',
  installed: 'panels.market.sharedOk',
  outdated: 'panels.market.sharedOutdated',
  unsatisfied: 'panels.market.sharedUnsatisfied',
  missing: 'panels.market.sharedMissing',
  unchecked: 'panels.market.unchecked',
};

export interface SharedRow {
  readonly id: string;
  readonly kind: 'plugin' | 'lib';
  readonly label: string;
  readonly usedByKeys: readonly string[];
  readonly state: SharedState;
  readonly canUpdate: boolean;
  readonly version?: { readonly installed?: string; readonly latest?: string };
  readonly detail?: string;
}

export function sharedActions(row: SharedRow): MarketRowAction[] {
  return [...(row.canUpdate ? (['update-dependency'] as const) : [])];
}

const SHARED_RANK: Readonly<Record<SharedState, number>> = {
  checking: -1,
  unchecked: 0,
  installed: 1,
  outdated: 2,
  unsatisfied: 3,
  missing: 4,
};

interface SharedBucket {
  readonly kind: 'plugin' | 'lib';
  readonly name: string;
  readonly label: string;
  readonly purpose?: string;
  readonly users: string[];
  readonly states: SharedState[];
  installed?: string;
  latest?: string;
  command?: string;
}

export function sharedRows(
  manifests: readonly UnitManifest[],
  capabilities: CapabilityMap | null,
): SharedRow[] {
  const catalog = manifests.filter(
    (manifest) => (manifest.env?.plugins ?? []).length > 0 || (manifest.env?.libs ?? []).length > 0,
  );
  const byId = new Map(catalog.map((manifest) => [manifest.id, manifest] as const));
  const buckets = new Map<string, SharedBucket>();
  const bucketOf = (kind: 'plugin' | 'lib', name: string, label: string, purpose?: string): SharedBucket => {
    const id = `${kind}:${name}`;
    const found = buckets.get(id);
    if (found !== undefined) {
      return found;
    }
    const created: SharedBucket = { kind, name, label, users: [], states: [], ...(purpose === undefined ? {} : { purpose }) };
    buckets.set(id, created);
    return created;
  };

  for (const manifest of catalog) {
    const capability = capabilities?.[manifest.id];
    const released = capability?.released === true;
    for (const need of manifest.env?.plugins ?? []) {
      const source = need.installSource;
      const bucket = bucketOf('plugin', need.name, source?.kind === 'npm' ? source.package : need.name);
      if (released) continue;
      bucket.users.push(manifest.id);
      const state = capability?.plugins?.find((item) => item.name === need.name);
      bucket.states.push(state === undefined ? 'unchecked' : state.status === 'ok' ? 'installed' : state.status);
      if (state?.release !== undefined) {
        bucket.installed ??= state.release.installed;
        bucket.latest ??= state.release.latest;
      }
      bucket.command ??= state?.command;
    }
    for (const need of manifest.env?.libs ?? []) {
      const bucket = bucketOf('lib', need.name, need.name, need.purpose);
      if (released) continue;
      bucket.users.push(manifest.id);
      const state = capability?.libs?.find((item) => item.name === need.name);
      bucket.states.push(state === undefined ? 'unchecked' : state.status === 'ok' ? 'installed' : state.status);
      bucket.installed ??= state?.installed;
      bucket.latest ??= state?.latest;
      bucket.command ??= state?.command;
    }
  }

  const rows: SharedRow[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.users.length === 0) continue;
    const state: SharedState =
      capabilities === null
        ? 'checking'
        : bucket.states.reduce<SharedState>(
            (soFar, item) => (SHARED_RANK[item] > SHARED_RANK[soFar] ? item : soFar),
            'unchecked',
          );
    const version =
      bucket.installed === undefined && bucket.latest === undefined
        ? undefined
        : { ...(bucket.installed === undefined ? {} : { installed: bucket.installed }), ...(bucket.latest === undefined ? {} : { latest: bucket.latest }) };
    const detail = bucket.purpose === undefined ? undefined : `${bucket.label} —— ${bucket.purpose}`;
    rows.push({
      id: `${bucket.kind}:${bucket.name}`,
      kind: bucket.kind,
      label: bucket.label,
      usedByKeys: bucket.users.map((unit) => byId.get(unit)?.card?.titleKey ?? unit),
      state,
      canUpdate: state === 'outdated' || state === 'unsatisfied',
      ...(version === undefined ? {} : { version }),
      ...(detail === undefined ? {} : { detail }),
    });
  }
  return rows;
}
