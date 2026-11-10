import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { ensureDir, linkDir, removePath, writeJsonFile, writeTextFile } from '@dsh-workbench/shared/host';
import { installWithRetry, type InstallAttempt, type InstallRetryResult } from './install-retry.js';
import { CORE_ARTIFACTS, SELF_UPDATE_PACKAGES } from './self-update-plan.js';

const DEFAULT_WORKSPACE = 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n';
const CORE = '@dsh-workbench/core';
const LINK_PREFIX = 'link:';

export interface VersionProject {
  readonly dir: string;
  readonly manifest: string;
  readonly workspace: string;
  readonly npmrc?: string | undefined;
}

export interface VersionLink {
  readonly pkg: string;
  readonly target: string;
  readonly link: string;
  readonly spec: string;
}

export interface VersionInstallDeps {
  readonly run: (command: string) => Promise<InstallAttempt>;
  readonly log?: ((message: string) => void) | undefined;
}

export function versionDirOf(versionsDir: string, version: string): string {
  return join(versionsDir, version);
}

export function versionProjectFiles(input: {
  readonly profileDir: string;
  readonly versionsDir: string;
  readonly version: string;
  readonly packages?: readonly string[] | undefined;
}): VersionProject {
  const packages = input.packages ?? SELF_UPDATE_PACKAGES;
  const workspacePath = join(input.profileDir, 'pnpm-workspace.yaml');
  const npmrcPath = join(input.profileDir, '.npmrc');
  const workspace = existsSync(workspacePath) ? readFileSync(workspacePath, 'utf8') : DEFAULT_WORKSPACE;
  return {
    dir: versionDirOf(input.versionsDir, input.version),
    manifest: `${JSON.stringify(manifestOf(packages, input.version), null, 2)}\n`,
    workspace: withReleaseAge(input.version, packages, workspace),
    npmrc: existsSync(npmrcPath) ? readFileSync(npmrcPath, 'utf8') : undefined,
  };
}

export function writeVersionProject(project: VersionProject): void {
  ensureDir(project.dir);
  writeTextFile(join(project.dir, 'package.json'), project.manifest);
  writeTextFile(join(project.dir, 'pnpm-workspace.yaml'), project.workspace);
  if (project.npmrc !== undefined) writeTextFile(join(project.dir, '.npmrc'), project.npmrc);
}

export function versionSelfCheck(input: {
  readonly versionDir: string;
  readonly version: string;
  readonly packages?: readonly string[] | undefined;
}): boolean {
  const packages = input.packages ?? SELF_UPDATE_PACKAGES;
  for (const pkg of packages) {
    const manifest = join(input.versionDir, 'node_modules', pkg, 'package.json');
    if (!existsSync(manifest)) return false;
    try {
      if ((JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown }).version !== input.version) return false;
    } catch {
      return false;
    }
  }
  for (const artifact of CORE_ARTIFACTS) {
    if (!existsSync(join(input.versionDir, 'node_modules', CORE, artifact))) return false;
  }
  return true;
}

export async function installVersionDir(input: {
  readonly project: VersionProject;
  readonly version: string;
  readonly command: string;
  readonly deps: VersionInstallDeps;
  readonly packages?: readonly string[] | undefined;
}): Promise<InstallRetryResult> {
  const packages = input.packages ?? SELF_UPDATE_PACKAGES;
  writeVersionProject(input.project);
  return installWithRetry(
    {
      run: input.deps.run,
      resolves: () => versionSelfCheck({ versionDir: input.project.dir, version: input.version, packages }),
      drop: () => removePath(join(input.project.dir, 'node_modules')),
      ...(input.deps.log === undefined ? {} : { log: input.deps.log }),
    },
    input.command,
    {
      what: '工作台包',
      dropLabel: 'node_modules',
      mismatch: '第一遍没装上（下载缓存和已有的 node_modules 对不上）',
      unresolved: '第一遍装完还是读不到',
      settled: '装好了',
      unresolvedAgain: '还是读不到',
      failedAgain: '还是没装上',
    },
  );
}

export function versionLinksOf(input: {
  readonly profileDir: string;
  readonly versionDir: string;
  readonly packages?: readonly string[] | undefined;
}): readonly VersionLink[] {
  const packages = input.packages ?? SELF_UPDATE_PACKAGES;
  return packages.map((pkg) => {
    const target = join(input.versionDir, 'node_modules', pkg);
    return {
      pkg,
      target,
      link: join(input.profileDir, 'node_modules', pkg),
      spec: `${LINK_PREFIX}${relative(input.profileDir, target).split(sep).join('/')}`,
    };
  });
}

export function flipProfileLinks(links: readonly VersionLink[]): void {
  for (const link of links) linkDir(link.target, link.link);
}

export function writeProfileLinks(input: {
  readonly profileDir: string;
  readonly links: readonly VersionLink[];
}): void {
  const manifestPath = join(input.profileDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown> & {
    dependencies?: Record<string, string> | undefined;
  };
  const dependencies = { ...(manifest.dependencies ?? {}) };
  for (const link of input.links) dependencies[link.pkg] = link.spec;
  writeJsonFile(manifestPath, { ...manifest, dependencies });
}

export function isManagedLinkSpec(spec: string, versionsDir: string, baseDir: string): boolean {
  if (!spec.startsWith(LINK_PREFIX)) return false;
  const target = resolve(baseDir, spec.slice(LINK_PREFIX.length));
  const root = resolve(versionsDir);
  return target === root || target.startsWith(`${root}${sep}`);
}

function manifestOf(packages: readonly string[], version: string): Record<string, unknown> {
  const dependencies: Record<string, string> = {};
  for (const name of packages) dependencies[name] = version;
  return { name: `dsh-workbench-versions-${version}`, private: true, dependencies };
}

function releaseAgeNameOf(line: string): string | undefined {
  return /^\s*-\s*'(\S+?)@(?=\d)/.exec(line)?.[1];
}

function listsVersion(line: string, version: string): boolean {
  return line
    .split('||')
    .some((part) => part.trim().replace(/^.*@/, '').replace(/'$/, '') === version);
}

function withReleaseAge(version: string, packages: readonly string[], workspace: string): string {
  const lines = workspace.replace(/\n+$/, '').split('\n');
  const missing: string[] = [];
  for (const name of packages) {
    const at = lines.findIndex((line) => releaseAgeNameOf(line) === name);
    if (at < 0) {
      missing.push(`  - '${name}@${version}'`);
      continue;
    }
    const line = lines[at] ?? '';
    if (!listsVersion(line, version)) {
      lines[at] = line.endsWith("'") ? `${line.slice(0, -1)} || ${version}'` : `${line} || ${version}`;
    }
  }
  if (missing.length === 0) return `${lines.join('\n')}\n`;
  const key = lines.findIndex((line) => line.startsWith('minimumReleaseAgeExclude:'));
  if (key < 0) return `${lines.join('\n')}\n\nminimumReleaseAgeExclude:\n${missing.join('\n')}\n`;
  let end = key + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end] ?? '')) end += 1;
  lines.splice(end, 0, ...missing);
  return `${lines.join('\n')}\n`;
}
