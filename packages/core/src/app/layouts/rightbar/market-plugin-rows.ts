import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import type { MarketRow } from './market-rows';

function noteOf(plugin: InstalledPlugin): MarketRow['note'] {
  if (plugin.broken === true) {
    return {
      key: 'panels.market.pluginBroken' as const,
      params: {} as Readonly<Record<string, string>>,
      tone: 'alert' as const,
    };
  }
  if (plugin.local === true) return undefined;
  return undefined;
}

export function installedPluginRows(
  plugins: readonly InstalledPlugin[],
  defaults: ReadonlySet<string> = new Set(),
  changed: Readonly<Record<string, number>> = {},
): MarketRow[] {
  return plugins.map((plugin) => {
    const id = `plugin:${plugin.pkg}`;
    const name = plugin.name ?? plugin.pkg;
    const outdated =
      plugin.installed !== undefined && plugin.latest !== undefined && plugin.latest !== plugin.installed;
    const note = noteOf(plugin);
    return {
      id,
      titleKey: plugin.pkg,
      label: name,
      plugin: true,
      state: outdated ? 'outdated' : plugin.broken === true ? 'broken' : 'installed',
      canInstall: false,
      canUpdate: outdated,
      canUninstall: true,
      ...(plugin.local === true ? { local: true } : {}),
      ...(plugin.broken === true ? { broken: true } : {}),
      defaultShown: defaults.has(id),
      defaultChanged: changed[id] ?? 0,
      ...(note === undefined ? {} : { note }),
      ...(plugin.installed === undefined
        ? {}
        : { versionLabel: `${plugin.pkg}@${plugin.installed}` }),
      pkg: plugin.pkg,
      ...(plugin.installed === undefined
        ? {}
        : {
            version: {
              installed: plugin.installed,
              ...(plugin.latest === undefined ? {} : { latest: plugin.latest }),
            },
          }),
    };
  });
}
