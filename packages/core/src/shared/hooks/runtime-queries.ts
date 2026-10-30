import type { ApiResponse, HostSurface, RuntimeCapabilities, RuntimeProfile } from '@dsh-workbench/shared';
import { apiGet } from '@dsh-workbench/shared';

export type RuntimeCapabilitiesPayload = {
  readonly capabilities: RuntimeCapabilities;
  readonly runtimeProfile?: RuntimeProfile | null;
  readonly surface?: HostSurface | null;
};

export function readRuntimeCapabilities(): Promise<ApiResponse<RuntimeCapabilitiesPayload>> {
  return apiGet<RuntimeCapabilitiesPayload>('health');
}
