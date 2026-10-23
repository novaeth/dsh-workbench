import { param, type RouteTable } from '@dsh-workbench/shared/host';
import type { ValueHandoff } from '@dsh-workbench/shared/host';
import type { PanelEntry } from './config';
import { panelsHandoffEntry } from './handoff';
import type { PanelsService } from './service';

export function panelRoutes(panels: PanelsService, values?: ValueHandoff): RouteTable {
  return {
    panels: (search) => {
      const path = param(search, 'path') ?? null;
      const entry = panelsHandoffEntry(path === null ? {} : { path });
      const handed = entry === undefined ? undefined : values?.take(entry);
      const defaults = [
        ...panels.list(null, 'machine').filter((unit) => unit.shown).map((unit) => unit.id),
        ...panels
          .listPlugins(null, 'machine')
          .filter((plugin) => plugin.shown)
          .map((plugin) => plugin.id),
      ];
      const own = panels.boards(path).workspace !== null;
      const units = handed === undefined ? panels.list(path) : (handed.value as readonly PanelEntry[]);
      const plugins = panels.listPlugins(path);
      return {
        ok: true,
        units,
        plugins,
        defaults,
        own,
        changed: Object.fromEntries(panels.changedBy()),
      };
    },
  };
}
