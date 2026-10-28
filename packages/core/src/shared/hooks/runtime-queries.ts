import type { ApiResponse, RuntimeCapabilities, RuntimeProfile } from '@dsh-workbench/shared';
import { apiGet } from '@dsh-workbench/shared';

export type RuntimeCapabilitiesPayload = {
  readonly capabilities: RuntimeCapabilities;
  readonly runtimeProfile?: RuntimeProfile | null;
};

export function readRuntimeCapabilities(): Promise<ApiResponse<RuntimeCapabilitiesPayload>> {
  return apiGet<RuntimeCapabilitiesPayload>('health');
}
