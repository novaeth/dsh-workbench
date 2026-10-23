import type { DshShell } from '@dsh-workbench/shared';
import { param, type RouteTable } from '@dsh-workbench/shared/host';
import type { InstalledPlugin, InstalledPluginsPayload } from '@/shared/api/installed-plugins';
import { INSTALLED_PLUGINS_ROUTE } from '@/shared/api/installed-plugins';
import { probeRelease } from '@/shared/api/host/release';
import type { PluginLedger } from './plugin-ledger';
import { pluginOnDisk } from './plugin-name';

export async function installedPlugins(options: {
  readonly ledger: PluginLedger;
  readonly shell?: DshShell | undefined;
  readonly force?: boolean;
}): Promise<readonly InstalledPlugin[]> {
  const { ledger, shell, force = false } = options;
  const rows: InstalledPlugin[] = [];
  for (const entry of ledger.list()) {
    const release =
      shell === undefined || entry.local === true || entry.registry === undefined
        ? undefined
        : await probeRelease({ shell, package: entry.package, registry: entry.registry, force });
    rows.push({
      pkg: entry.package,
      ...(entry.name === undefined ? {} : { name: entry.name }),
      ...(release === undefined
        ? {}
        : {
            installed: release.installed,
            ...(release.latest === undefined ? {} : { latest: release.latest }),
          }),
      ...(entry.local === true ? { local: true } : {}),
      ...(pluginOnDisk(entry) ? {} : { broken: true }),
    });
  }
  return rows;
}

export function pluginRoutes(options: {
  readonly ledger: PluginLedger;
  readonly shell?: DshShell | undefined;
}): RouteTable {
  return {
    [INSTALLED_PLUGINS_ROUTE]: async (search) => {
      const plugins = await installedPlugins({
        ledger: options.ledger,
        ...(options.shell === undefined ? {} : { shell: options.shell }),
        force: param(search, 'force') === '1',
      });
      const payload: InstalledPluginsPayload = { plugins };
      return { ok: true, ...payload };
    },
  };
}
