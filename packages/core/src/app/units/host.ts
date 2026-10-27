import { panelsHost } from '@/modules/panels';
import type { UnitOwnedFace } from '@dsh-workbench/shared/host';

const OWNED: readonly UnitOwnedFace[] = [panelsHost];

export function assembleHostUnits(registry: { registerOwned(face: UnitOwnedFace): () => void }): void {
  for (const face of OWNED) registry.registerOwned(face);
}
