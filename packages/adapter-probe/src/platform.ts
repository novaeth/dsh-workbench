import { hostOsOf } from '@dsh-workbench/shared/host';
import type { HostOs } from '@dsh-workbench/shared/contract/protocol/platform';

export { hostOsOf, hostSurface, profileNameOf, type HostSurfaceInput } from '@dsh-workbench/shared/host';

export function currentHostOs(): HostOs {
  return hostOsOf(process.platform);
}
