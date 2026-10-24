import type { UnitManifest } from '../unit.js';

export const UNIT_MANIFESTS_ROUTE = 'unit-manifests';

export interface UnitManifestsPayload {
  readonly manifests: readonly UnitManifest[];
  readonly installable: readonly string[];
}
