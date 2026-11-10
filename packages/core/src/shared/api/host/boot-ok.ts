import type { PostResource } from '@dsh-workbench/shared/host';
import { nowIso, workbenchUpFile, writeBootRecord } from '@dsh-workbench/shared/host';
import { BOOT_OK_RESOURCE } from '@dsh-workbench/shared/contract/protocol/boot-ok';

export interface BootOkDeps {
  readonly version: () => string;
  readonly file?: string | undefined;
}

export function bootOkAction(deps: BootOkDeps): PostResource {
  return {
    resource: BOOT_OK_RESOURCE,
    handle: () => {
      const version = deps.version();
      writeBootRecord({ version, at: nowIso(), pid: process.pid }, deps.file ?? workbenchUpFile());
      return { ok: true, version };
    },
  };
}
