import type { UnitManifest } from '@dsh-workbench/shared';

export interface UnitReadiness {
  readonly canMount: boolean;
  readonly missingHard: readonly string[];
  readonly missingSoft: readonly string[];
}

export function unitReadiness(manifest: UnitManifest, lookup: (name: string) => unknown): UnitReadiness {
  const missingHard = manifest.host.inject.filter((name) => lookup(name) === undefined);
  const missingSoft = (manifest.host.optional ?? []).filter((name) => lookup(name) === undefined);
  return { canMount: missingHard.length === 0, missingHard, missingSoft };
}
