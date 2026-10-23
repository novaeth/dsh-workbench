import type { UnitManifest } from '@dsh-workbench/shared';

export const UNIT_MANIFESTS_ROUTE = 'unit-manifests';

export interface UnitManifestsPayload {
  readonly manifests: readonly UnitManifest[];
  readonly installable: readonly string[];
}
