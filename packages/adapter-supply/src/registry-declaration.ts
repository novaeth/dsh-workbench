import type { Seam } from '@dsh-workbench/shared/host';
import { createRegistryLookup } from '@dsh-workbench/shared/host';

export {
  declarationRefusalOf,
  dshRecordOf,
  localDirOf,
  packageManifestOf,
  packageNameOf,
  pathDeclarationOf,
} from '@dsh-workbench/shared/host';
export type { RegistryDshLookup } from '@dsh-workbench/shared/host';

const lookup = createRegistryLookup();

export async function registryDshOf(options: {
  seam: Seam;
  name: string;
  registry?: string | undefined;
  force?: boolean;
}): Promise<{ readonly readable: boolean; readonly raw: unknown }> {
  return lookup.registryDshOf(options);
}

export async function registryDeclarationOf(options: {
  seam: Seam;
  name: string;
  registry: string;
  force?: boolean;
}): Promise<unknown | undefined> {
  return lookup.registryDeclarationOf(options);
}
