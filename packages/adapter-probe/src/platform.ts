import { hostOsOf, shellKindOf } from '@dsh-workbench/shared/host';
import type { ShellKind } from '@dsh-workbench/shared/host';
import type { HostOs } from '@dsh-workbench/shared/contract/protocol/platform';

export { hostOsOf, hostSurface, profileNameOf, shellKindOf, type HostSurfaceInput } from '@dsh-workbench/shared/host';

export function currentHostOs(): HostOs {
  return hostOsOf(process.platform);
}

export function currentShellKind(): ShellKind {
  return shellKindOf(process.platform);
}
