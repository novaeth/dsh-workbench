import fs from 'node:fs';
import path from 'node:path';

export interface InstalledSource {
  readonly version: string;
  readonly registry: string;
}

export type InstalledSourceMap = Readonly<Record<string, InstalledSource>>;

const FILE_NAME = '.dsh-workbench-sources.json';
const FILE_VERSION = 1;

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function installedSourcesFile(profileDir: string): string {
  return path.join(profileDir, FILE_NAME);
}

export function readInstalledSources(profileDir: string | null): InstalledSourceMap {
  if (profileDir === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(installedSourcesFile(profileDir), 'utf8'));
  } catch {
    return {};
  }
  const packages = asRecord(asRecord(parsed)?.packages);
  if (packages === undefined) return {};
  const found: Record<string, InstalledSource> = {};
  for (const [pkg, value] of Object.entries(packages)) {
    const record = asRecord(value);
    if (record === undefined) continue;
    const version = asText(record.version);
    const registry = asText(record.registry);
    if (pkg === '' || version === '' || registry === '') continue;
    found[pkg] = { version, registry };
  }
  return found;
}

export function packageSourceOf(profileDir: string | null, pkg: string): InstalledSource | undefined {
  return readInstalledSources(profileDir)[pkg];
}

function writeInstalledSources(profileDir: string, sources: InstalledSourceMap): void {
  const file = installedSourcesFile(profileDir);
  const temp = `${file}.tmp`;
  const text = `${JSON.stringify({ version: FILE_VERSION, packages: sources }, null, 2)}\n`;
  fs.writeFileSync(temp, text, { mode: 0o600 });
  fs.renameSync(temp, file);
}

export function rememberPackageSource(profileDir: string, pkg: string, source: InstalledSource): void {
  const trimmed = pkg.trim();
  if (trimmed === '' || source.version.trim() === '' || source.registry.trim() === '') return;
  const all = { ...readInstalledSources(profileDir) };
  all[trimmed] = { version: source.version.trim(), registry: source.registry.trim() };
  writeInstalledSources(profileDir, all);
}

export function forgetPackageSource(profileDir: string, pkg: string): void {
  const all = { ...readInstalledSources(profileDir) };
  if (all[pkg] === undefined) return;
  delete all[pkg];
  writeInstalledSources(profileDir, all);
}
