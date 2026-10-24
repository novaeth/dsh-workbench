import type { PanelPluginRef } from './config';
import type { PluginLedger } from './plugin-ledger';
import { pluginNameOf } from './plugin-name';

export function pluginPanelRefs(ledger: PluginLedger): PanelPluginRef[] {
  return ledger.list().map((entry) => {
    const name = pluginNameOf(entry);
    return {
      pkg: entry.package,
      title: name ?? entry.package,
      ...(name === undefined ? {} : { name }),
    };
  });
}
