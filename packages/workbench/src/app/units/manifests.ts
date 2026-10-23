import { apiGet, factOfRoute } from '@dsh-workbench/shared';
import { UNIT_MANIFESTS_ROUTE, type UnitManifestsPayload } from '@/shared/api/unit-manifests';
import { subscribeFactRevision } from '@/shared/hooks/use-facts';
import type { ClientUnitRegistry } from './registry';

export interface UnitManifestLoaderOptions {
  readonly subscribeFacts?: (fact: string, listener: () => void) => () => void;
}

export function createUnitManifestLoader(
  options: UnitManifestLoaderOptions = {},
): (registry: ClientUnitRegistry) => void {
  let inFlight = false;
  let queued = false;
  let watching = false;
  const subscribeFacts = options.subscribeFacts ?? subscribeFactRevision;

  const load = async (registry: ClientUnitRegistry): Promise<void> => {
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      const response = await apiGet<UnitManifestsPayload>(UNIT_MANIFESTS_ROUTE).catch(() => null);
      if (response?.ok === true && Array.isArray(response.manifests)) {
        registry.setManifests(
          response.manifests,
          Array.isArray(response.installable) ? response.installable : undefined,
        );
      }
    } finally {
      inFlight = false;
      if (queued) {
        queued = false;
        void load(registry);
      }
    }
  };

  return (registry) => {
    if (!watching) {
      watching = true;
      subscribeFacts(factOfRoute(UNIT_MANIFESTS_ROUTE), () => void load(registry));
    }
    void load(registry);
  };
}
