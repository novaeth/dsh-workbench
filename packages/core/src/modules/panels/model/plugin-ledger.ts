import type { ModuleStore, PluginLedgerEntry, WorkspaceStore } from '@dsh-workbench/shared/host';
import {
  heldEntriesOfHome,
  heldEntryOfPlugin,
  pluginEntriesOfHome,
  pluginEntryOf,
  readPluginLedger,
  withPluginEntry,
  withReleasedEntry,
  withoutPluginEntry,
  writePluginLedger,
} from '@dsh-workbench/shared/host';
import { PANELS_MODULE_ID } from './service';
import { pluginNameOf } from './plugin-name';

export interface PluginLedgerIntent {
  readonly package: string;
  readonly registry?: string | undefined;
  readonly local?: boolean | undefined;
}

export interface PluginLedger {
  readonly home: string;
  list(): readonly PluginLedgerEntry[];
  all(): readonly PluginLedgerEntry[];
  read(pkg: string): PluginLedgerEntry | undefined;
  held(pkg: string): boolean;
  heldAsPlugin(plugin: string): PluginLedgerEntry | undefined;
  intend(intent: PluginLedgerIntent): void;
  complete(pkg: string, name: string | undefined): void;
  release(pkg: string): void;
  drop(pkg: string): void;
}

export function createPluginLedger(options: {
  readonly store: WorkspaceStore;
  readonly home: string;
}): PluginLedger {
  const folder: ModuleStore = options.store.machine(PANELS_MODULE_ID);
  const home = options.home;
  const all = (): readonly PluginLedgerEntry[] => readPluginLedger(folder);
  const save = (entries: readonly PluginLedgerEntry[]): void => writePluginLedger(folder, entries);

  return {
    home,
    list: () => heldEntriesOfHome(all(), home),
    all: () => pluginEntriesOfHome(all(), home),
    read: (pkg) => {
      const entry = pluginEntryOf(all(), home, pkg);
      return entry !== undefined && entry.releasedAt === undefined ? entry : undefined;
    },
    held: (pkg) => {
      const entry = pluginEntryOf(all(), home, pkg);
      return entry !== undefined && entry.releasedAt === undefined;
    },
    heldAsPlugin: (plugin) => {
      const key = plugin.trim();
      if (key === '') return undefined;
      const known = heldEntryOfPlugin(all(), home, key);
      if (known !== undefined) return known;
      return heldEntriesOfHome(all(), home).find((entry) => pluginNameOf(entry) === key);
    },
    intend(intent) {
      const registry = intent.registry?.trim() ?? '';
      save(
        withPluginEntry(all(), {
          opencliHome: home,
          package: intent.package,
          installedAt: new Date().toISOString(),
          ...(registry === '' ? {} : { registry }),
          ...(intent.local === true ? { local: true } : {}),
        }),
      );
    },
    complete(pkg, name) {
      const trimmed = name?.trim() ?? '';
      if (trimmed === '') return;
      const current = pluginEntryOf(all(), home, pkg);
      if (current === undefined || current.releasedAt !== undefined) return;
      save(withPluginEntry(all(), { ...current, name: trimmed }));
    },
    release(pkg) {
      save(withReleasedEntry(all(), home, pkg, new Date().toISOString()));
    },
    drop(pkg) {
      save(withoutPluginEntry(all(), home, pkg));
    },
  };
}
