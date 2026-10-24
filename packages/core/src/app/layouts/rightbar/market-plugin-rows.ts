import type { InstalledPlugin } from '@/shared/api/installed-plugins';
import type { Translate } from '@dsh-workbench/shared';
import type { MarketRow } from './market-rows';

export interface InstalledPluginKept {
  readonly key:
    | 'panels.market.pluginKeptInUse'
    | 'panels.market.pluginKeptUnsure'
    | 'panels.market.pluginKeptHeld'
    | 'panels.market.pluginKeptUnnamed';
  readonly names?: readonly string[];
}

export function installedPluginKept(value: unknown): InstalledPluginKept | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const kept = (value as { readonly kept?: unknown }).kept;
  if (typeof kept !== 'object' || kept === null) return undefined;
  const kind = (kept as { readonly kind?: unknown }).kind;
  if (kind === 'held') return { key: 'panels.market.pluginKeptHeld' };
  if (kind === 'unnamed') return { key: 'panels.market.pluginKeptUnnamed' };
  if (kind === 'unsure') return { key: 'panels.market.pluginKeptUnsure' };
  if (kind !== 'claimed') return undefined;
  const raw = (kept as { readonly by?: unknown }).by;
  const names = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
  return names.length === 0
    ? { key: 'panels.market.pluginKeptUnsure' }
    : { key: 'panels.market.pluginKeptInUse', names };
}

export function installedPluginNotice(value: unknown, t: Translate): string | null {
  const kept = installedPluginKept(value);
  if (kept === undefined) return null;
  return t(
    kept.key,
    kept.names === undefined
      ? {}
      : { names: kept.names.join(t('panels.market.listSeparator')) },
  );
}

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
