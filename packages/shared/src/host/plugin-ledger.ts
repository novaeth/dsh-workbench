import type { ModuleStore } from './workspace-store.js';

export const PLUGIN_LEDGER_FILE = 'plugins.json';

export interface PluginLedgerEntry {
  readonly opencliHome: string;
  readonly package: string;
  readonly name?: string;
  readonly registry?: string;
  readonly local?: boolean;
  readonly installedAt: string;
  readonly releasedAt?: string;
}

export function ledgerKeyOf(entry: {
  readonly opencliHome: string;
  readonly package: string;
}): string {
  return `${entry.opencliHome}\u0000${entry.package}`;
}

function textOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function entryOf(value: unknown): PluginLedgerEntry | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const box = value as Readonly<Record<string, unknown>>;
  const opencliHome = textOf(box['opencliHome']);
  const pkg = textOf(box['package']);
  const installedAt = textOf(box['installedAt']);
  if (opencliHome === undefined || pkg === undefined || installedAt === undefined) return undefined;
  const name = textOf(box['name']);
  const registry = textOf(box['registry']);
  const releasedAt = textOf(box['releasedAt']);
  return {
    opencliHome,
    package: pkg,
    installedAt,
    ...(name === undefined ? {} : { name }),
    ...(registry === undefined ? {} : { registry }),
    ...(releasedAt === undefined ? {} : { releasedAt }),
    ...(box['local'] === true ? { local: true } : {}),
  };
}

export function parsePluginLedger(raw: unknown): PluginLedgerEntry[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const list = (raw as Readonly<Record<string, unknown>>)['entries'];
  if (!Array.isArray(list)) return [];
  const entries: PluginLedgerEntry[] = [];
  for (const item of list) {
    const entry = entryOf(item);
    if (entry === undefined) continue;
    if (entries.some((known) => ledgerKeyOf(known) === ledgerKeyOf(entry))) continue;
    entries.push(entry);
  }
  return entries;
}

export function readPluginLedger(store: ModuleStore): PluginLedgerEntry[] {
  return parsePluginLedger(store.read(PLUGIN_LEDGER_FILE));
}

export function writePluginLedger(store: ModuleStore, entries: readonly PluginLedgerEntry[]): void {
  if (entries.length === 0) {
    store.remove(PLUGIN_LEDGER_FILE);
    return;
  }
  store.write(PLUGIN_LEDGER_FILE, { entries });
}

export function pluginEntriesOfHome(
  entries: readonly PluginLedgerEntry[],
  opencliHome: string,
): PluginLedgerEntry[] {
  return entries.filter((entry) => entry.opencliHome === opencliHome);
}

export function isHeldEntry(entry: PluginLedgerEntry): boolean {
  return entry.releasedAt === undefined;
}

export function heldEntriesOfHome(
  entries: readonly PluginLedgerEntry[],
  opencliHome: string,
): PluginLedgerEntry[] {
  return pluginEntriesOfHome(entries, opencliHome).filter(isHeldEntry);
}

export function heldEntryOfPlugin(
  entries: readonly PluginLedgerEntry[],
  opencliHome: string,
  plugin: string,
): PluginLedgerEntry | undefined {
  const key = plugin.trim();
  if (key === '') return undefined;
  return heldEntriesOfHome(entries, opencliHome).find(
    (entry) => entry.name === key || entry.package === key,
  );
}

export function withReleasedEntry(
  entries: readonly PluginLedgerEntry[],
  opencliHome: string,
  pkg: string,
  releasedAt: string,
): PluginLedgerEntry[] {
  const entry = pluginEntryOf(entries, opencliHome, pkg);
  if (entry === undefined || entry.releasedAt !== undefined) return [...entries];
  return withPluginEntry(entries, { ...entry, releasedAt });
}

export type PluginRetention = 'remove' | 'keep-held' | 'keep-claimed' | 'keep-unsure';

export function pluginRetentionOf(options: {
  readonly held: boolean;
  readonly claimedBy: readonly string[];
  readonly trustworthy: boolean;
}): PluginRetention {
  if (options.held) return 'keep-held';
  if (!options.trustworthy) return 'keep-unsure';
  return options.claimedBy.length > 0 ? 'keep-claimed' : 'remove';
}

export function pluginEntryOf(
  entries: readonly PluginLedgerEntry[],
  opencliHome: string,
  pkg: string,
): PluginLedgerEntry | undefined {
  const key = ledgerKeyOf({ opencliHome, package: pkg });
  return entries.find((entry) => ledgerKeyOf(entry) === key);
}

export function withPluginEntry(
  entries: readonly PluginLedgerEntry[],
  entry: PluginLedgerEntry,
): PluginLedgerEntry[] {
  const key = ledgerKeyOf(entry);
  return [...entries.filter((item) => ledgerKeyOf(item) !== key), entry];
}

export function withoutPluginEntry(
  entries: readonly PluginLedgerEntry[],
  opencliHome: string,
  pkg: string,
): PluginLedgerEntry[] {
  const key = ledgerKeyOf({ opencliHome, package: pkg });
  return entries.filter((entry) => ledgerKeyOf(entry) !== key);
}
