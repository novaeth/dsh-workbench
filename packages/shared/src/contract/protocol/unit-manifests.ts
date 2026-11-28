import type { UnitManifest } from '../unit.js';

export const UNIT_MANIFESTS_ROUTE = 'unit-manifests';

export interface UnitManifestRefusal {
  readonly unit: string;
  readonly pkg?: string;
  readonly reasons: readonly string[];
}

export interface UnitManifestsPayload {
  readonly ok?: true;
  readonly manifests: readonly UnitManifest[];
  readonly installable: readonly string[];
  readonly refusals?: readonly UnitManifestRefusal[];
}
