import { apiGet, factOfRoute } from '@dsh-workbench/shared';
import { UNIT_MANIFESTS_ROUTE, type UnitManifestsPayload } from '@/kernel/contract/unit-manifests';
import { subscribeFactRevision } from '@/shared/hooks/use-facts';
import type { ClientUnitRegistry } from '@/kernel/client/registry';

export interface UnitManifestLoaderOptions {
  readonly subscribeFacts?: (fact: string, listener: () => void) => () => void;
}

function failureTextOf(response: unknown): string {
  const error = (response as { readonly error?: { readonly message?: unknown } } | null)?.error;
  const message = error?.message;
  return typeof message === 'string' && message !== ''
    ? message
    : '模块清单没读出来（宿主没有返回清单）';
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
      const response = await apiGet<UnitManifestsPayload>(UNIT_MANIFESTS_ROUTE);
      if (response?.ok === true && Array.isArray(response.manifests)) {
        registry.setManifests(
          response.manifests,
          Array.isArray(response.installable) ? response.installable : undefined,
        );
        registry.setManifestReadFailure(null);
      } else {
        registry.setManifestReadFailure(failureTextOf(response));
      }
    } catch (error) {
      registry.setManifestReadFailure(error instanceof Error ? error.message : String(error));
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
      subscribeFacts(factOfRoute(UNIT_MANIFESTS_ROUTE), () => {
        void load(registry);
      });
    }
    void load(registry);
  };
}
