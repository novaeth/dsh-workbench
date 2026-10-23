import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cliCatalogPath, vendorPluginsDir } from '@dsh-workbench/shared/host';
import {
  manifestCommandsOf,
  pluginCommandsOf,
  pluginNamesOf,
  type ReconCommand,
  type ReconPlugin,
} from './diy-recon';

function filesOf(path: string): readonly string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

export function reconCatalogOf(path: string = cliCatalogPath()): readonly ReconCommand[] | undefined {
  try {
    return manifestCommandsOf(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

export function installedPluginsOf(dir: string = vendorPluginsDir()): readonly ReconPlugin[] {
  return pluginNamesOf(filesOf(dir)).map((name) => ({
    name,
    commands: pluginCommandsOf(filesOf(join(dir, `opencli-plugin-${name}`))),
  }));
}
