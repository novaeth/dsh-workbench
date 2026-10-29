import type { DshHostContext } from '../api/dsh.js';
import type { RouteHandler } from './http.js';
import type { DshPluginRow, DshPluginsSnapshot } from '../contract/protocol/dsh-plugins.js';

const MANAGER_SERVICE = 'pluginManager';

interface DshPluginManagerFace {
  listBundles?(): Promise<unknown>;
  listPlugins?(): Promise<unknown>;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

function asArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (record === undefined) return [];
  for (const key of ['rows', 'items', 'list', 'bundles', 'plugins']) {
    const inner = record[key];
    if (Array.isArray(inner)) return inner;
  }
  return [];
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rowOf(value: unknown): DshPluginRow | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const name = asText(record.name) || asText(record.id);
  if (name === '') return undefined;
  return { name, version: asText(record.version), enabled: record.disabled !== true && record.enabled !== false };
}

function rowsOf(value: unknown): readonly DshPluginRow[] {
  const rows: DshPluginRow[] = [];
  for (const item of asArray(value)) {
    const row = rowOf(item);
    if (row !== undefined) rows.push(row);
  }
  return rows;
}

export async function readDshPlugins(ctx: DshHostContext): Promise<DshPluginsSnapshot> {
  const manager = ctx.get<DshPluginManagerFace>(MANAGER_SERVICE);
  if (manager === undefined) return { available: false, bundles: [], plugins: [] };
  const [bundles, plugins] = await Promise.all([
    manager.listBundles === undefined ? undefined : manager.listBundles(),
    manager.listPlugins === undefined ? undefined : manager.listPlugins(),
  ]);
  return { available: true, bundles: rowsOf(bundles), plugins: rowsOf(plugins) };
}

export function dshPluginsHandler(ctx: DshHostContext): RouteHandler {
  return () => readDshPlugins(ctx);
}
