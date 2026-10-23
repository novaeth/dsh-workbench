import { UNIT_MANIFESTS_ROUTE } from '@/shared/api/unit-manifests';
import type { UnitRegistry } from './unit-registry';

function rosterKeyOf(units: UnitRegistry): string {
  return units.all().map((host) => host.unit).join('\u0000');
}

export function bindRosterFacts(options: {
  readonly units: UnitRegistry;
  readonly bump: (facts: readonly string[]) => void;
}): () => void {
  let seen = rosterKeyOf(options.units);
  return options.units.subscribe(() => {
    const now = rosterKeyOf(options.units);
    if (now === seen) return;
    seen = now;
    options.bump([UNIT_MANIFESTS_ROUTE]);
  });
}
