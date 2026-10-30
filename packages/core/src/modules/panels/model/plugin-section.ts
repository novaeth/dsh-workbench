import type { DshShell } from '@dsh-workbench/shared';
import { requireSupply, param, type RouteTable, type SupplyPort } from '@dsh-workbench/shared/host';
import type { InstalledPlugin, InstalledPluginsPayload } from '@/shared/api/installed-plugins';
import { INSTALLED_PLUGINS_ROUTE } from '@/shared/api/installed-plugins';
import type { PluginLedger } from './plugin-ledger';
import { pluginOnDisk } from './plugin-name';

export async function installedPlugins(options: {
  readonly ledger: PluginLedger;
  readonly shell?: DshShell | undefined;
  readonly force?: boolean;
  readonly check?: boolean;
  readonly supply?: SupplyPort | undefined;
}): Promise<readonly InstalledPlugin[]> {
  const { ledger, shell, force = false, check = true } = options;
  const supply = options.supply ?? requireSupply();
  const rows: InstalledPlugin[] = [];
  for (const entry of ledger.list()) {
    const release =
      shell === undefined || entry.local === true || entry.registry === undefined
        ? undefined
        : await supply.probeRelease({ shell, package: entry.package, registry: entry.registry, force, check });
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
      ...(entry.registry === undefined ? {} : { registry: entry.registry }),
      ...(entry.installedAt === undefined ? {} : { installedAt: entry.installedAt }),
      ...(pluginOnDisk(entry, ledger.pluginFiles) ? {} : { broken: true }),
    });
  }
  return rows;
}

export function pluginRoutes(options: {
  readonly ledger: PluginLedger;
  readonly shell?: DshShell | undefined;
  readonly supply?: SupplyPort | undefined;
}): RouteTable {
  return {
    [INSTALLED_PLUGINS_ROUTE]: async (search) => {
      const plugins = await installedPlugins({
        ledger: options.ledger,
        ...(options.shell === undefined ? {} : { shell: options.shell }),
        ...(options.supply === undefined ? {} : { supply: options.supply }),
        force: param(search, 'force') === '1',
        check: param(search, 'check') !== '0',
      });
      const payload: InstalledPluginsPayload = { plugins };
      return { ok: true, ...payload };
    },
  };
}
