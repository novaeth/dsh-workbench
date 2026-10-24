import { vendorPluginsDir } from '@dsh-workbench/shared/host';
import { pluginAt } from '@dsh-workbench/shared/host';

export interface PluginEntryRef {
  readonly package: string;
  readonly local?: boolean | undefined;
  readonly name?: string | undefined;
}

export function pluginDirOf(entry: PluginEntryRef): string {
  return entry.local === true ? entry.package : `${vendorPluginsDir()}/${entry.package}`;
}

export function pluginOnDisk(entry: PluginEntryRef): boolean {
  return pluginAt(pluginDirOf(entry)) !== undefined;
}

export function pluginNameOf(entry: PluginEntryRef): string | undefined {
  if (entry.name !== undefined) return entry.name;
  const name = pluginAt(pluginDirOf(entry))?.name?.trim() ?? '';
  return name === '' ? undefined : name;
}
