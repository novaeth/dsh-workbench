import { pluginAt } from '@dsh-workbench/shared/host';

export interface PluginEntryRef {
  readonly package: string;
  readonly local?: boolean | undefined;
  readonly name?: string | undefined;
}

export interface PluginFiles {
  readonly dir?: string | undefined;
  readonly manifest?: string | undefined;
}

export function pluginDirOf(entry: PluginEntryRef, files: PluginFiles | undefined): string {
  if (entry.local === true || files?.dir === undefined) return entry.package;
  return `${files.dir}/${entry.package}`;
}

export function pluginOnDisk(entry: PluginEntryRef, files: PluginFiles | undefined): boolean {
  return pluginAt(pluginDirOf(entry, files), files?.manifest ?? '') !== undefined;
}

export function pluginNameOf(entry: PluginEntryRef, files: PluginFiles | undefined): string | undefined {
  if (entry.name !== undefined) return entry.name;
  const manifest = files?.manifest;
  if (manifest === undefined) return undefined;
  const name = pluginAt(pluginDirOf(entry, files), manifest)?.name?.trim() ?? '';
  return name === '' ? undefined : name;
}
