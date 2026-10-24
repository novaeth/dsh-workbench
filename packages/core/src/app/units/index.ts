import type { UnitClientFace } from '@dsh-workbench/shared';

const CLIENT_UNITS: readonly UnitClientFace[] = [];

export function assembleClientUnits(registry: { register(face: UnitClientFace): () => void }): void {
  for (const face of CLIENT_UNITS) registry.register(face);
}
