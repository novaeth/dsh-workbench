import { readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { removePath } from '@dsh-workbench/shared/host';

export interface PruneVersionsInput {
  readonly versionsDir: string;
  readonly profilesDir: string;
  readonly keep: readonly string[];
}

export interface PruneVersionsResult {
  readonly removed: readonly string[];
  readonly kept: readonly string[];
  readonly failed: readonly string[];
}

const LINK_PREFIX = 'link:';
const LINKED_PACKAGES = join('node_modules', '@dsh-workbench');
const VERSION_IN_TEXT = /versions\/([^/\\'"\s]+)\/node_modules/gu;

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function readJson(file: string): unknown {
  const text = readText(file);
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function subdirsOf(dir: string): readonly string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

function versionUnder(versionsDir: string, target: string): string | undefined {
  const root = resolve(versionsDir);
  const abs = resolve(target);
  if (!abs.startsWith(`${root}${sep}`)) return undefined;
  return abs.slice(root.length + 1).split(sep)[0];
}

function linkSpecsOf(profileDir: string): readonly string[] {
  const manifest = readJson(join(profileDir, 'package.json'));
  if (typeof manifest !== 'object' || manifest === null) return [];
  const dependencies = (manifest as { readonly dependencies?: unknown }).dependencies;
  if (typeof dependencies !== 'object' || dependencies === null) return [];
  return Object.values(dependencies as Readonly<Record<string, unknown>>)
    .filter((spec): spec is string => typeof spec === 'string')
    .map((spec) => spec.trim())
    .filter((spec) => spec.startsWith(LINK_PREFIX));
}

function linkTargetsOf(dir: string): readonly string[] {
  let names: readonly string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const name of names) {
    try {
      found.push(resolve(dir, readlinkSync(join(dir, name))));
    } catch {
      continue;
    }
  }
  return found;
}

function linkedVersionsOf(profileDir: string, versionsDir: string): readonly string[] {
  const found: string[] = [];
  for (const spec of linkSpecsOf(profileDir)) {
    const version = versionUnder(versionsDir, resolve(profileDir, spec.slice(LINK_PREFIX.length)));
    if (version !== undefined) found.push(version);
  }
  for (const target of linkTargetsOf(join(profileDir, LINKED_PACKAGES))) {
    const version = versionUnder(versionsDir, target);
    if (version !== undefined) found.push(version);
  }
  return found;
}

function versionsInText(text: string): readonly string[] {
  return [...text.matchAll(VERSION_IN_TEXT)].map((match) => match[1] as string);
}

export function referencedVersionsOf(input: {
  readonly profilesDir: string;
  readonly versionsDir: string;
}): ReadonlySet<string> {
  const found = new Set<string>();
  for (const profileDir of subdirsOf(input.profilesDir)) {
    for (const version of linkedVersionsOf(profileDir, input.versionsDir)) found.add(version);
    for (const version of versionsInText(readText(join(profileDir, 'package.json')))) found.add(version);
    for (const version of versionsInText(readText(join(profileDir, 'pnpm-lock.yaml')))) found.add(version);
  }
  return found;
}

export function pruneVersions(input: PruneVersionsInput): PruneVersionsResult {
  const keep = new Set(input.keep);
  const referenced = referencedVersionsOf({ profilesDir: input.profilesDir, versionsDir: input.versionsDir });
  const removed: string[] = [];
  const kept: string[] = [];
  const failed: string[] = [];
  for (const dir of subdirsOf(input.versionsDir)) {
    const version = dir.slice(dir.lastIndexOf(sep) + 1);
    if (keep.has(version) || referenced.has(version)) {
      kept.push(version);
      continue;
    }
    try {
      removePath(dir);
      removed.push(version);
    } catch {
      failed.push(version);
    }
  }
  return { removed, kept, failed };
}
