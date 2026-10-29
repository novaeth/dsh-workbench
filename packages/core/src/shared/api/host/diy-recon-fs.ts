import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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

export function reconCatalogOf(path: string): readonly ReconCommand[] | undefined {
  try {
    return manifestCommandsOf(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

export function installedPluginsOf(dir: string, prefix: string): readonly ReconPlugin[] {
  return pluginNamesOf(filesOf(dir), prefix).map((name) => ({
    name,
    commands: pluginCommandsOf(filesOf(join(dir, `${prefix}${name}`))),
  }));
}
