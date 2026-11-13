import { cpSync, existsSync, lstatSync, readFileSync, readlinkSync, renameSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { ensureDir, isManagedLinkSpec, linkDir, removePath, withReleaseAge, writeJsonFile, writeTextFile } from '@dsh-workbench/shared/host';
import { installWithRetry, type InstallAttempt, type InstallRetryResult } from './install-retry.js';
import { CORE_ARTIFACTS, SELF_UPDATE_PACKAGES } from './self-update-plan.js';
import { isRealDir } from './version-migrate.js';

export { isManagedLinkSpec };

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

export function versionMissingOf(input: {
  readonly versionDir: string;
  readonly version: string;
  readonly packages?: readonly string[] | undefined;
}): readonly string[] {
  const packages = input.packages ?? SELF_UPDATE_PACKAGES;
  const missing: string[] = [];
  for (const pkg of packages) {
    const manifest = join(input.versionDir, 'node_modules', pkg, 'package.json');
    if (!existsSync(manifest)) {
      missing.push(pkg);
      continue;
    }
    try {
      if ((JSON.parse(readFileSync(manifest, 'utf8')) as { version?: unknown }).version !== input.version) missing.push(pkg);
    } catch {
      missing.push(pkg);
    }
  }
  for (const artifact of CORE_ARTIFACTS) {
    if (!existsSync(join(input.versionDir, 'node_modules', CORE, artifact))) {
      missing.push(`core/${artifact}`);
      break;
    }
  }
  return missing;
}

export function versionSelfCheck(input: {
  readonly versionDir: string;
  readonly version: string;
  readonly packages?: readonly string[] | undefined;
}): boolean {
  return versionMissingOf(input).length === 0;
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
  return packages.map((pkg) => profileLinkOf(input.profileDir, pkg, join(input.versionDir, 'node_modules', pkg)));
}

export function profileLinkOf(profileDir: string, pkg: string, target: string): VersionLink {
  return {
    pkg,
    target,
    link: join(profileDir, 'node_modules', pkg),
    spec: `${LINK_PREFIX}${relative(profileDir, target).split(sep).join('/')}`,
  };
}

export function previousVersionLinksOf(input: {
  readonly profileDir: string;
  readonly versionsDir: string;
  readonly version: string;
  readonly packages?: readonly string[] | undefined;
}): readonly VersionLink[] {
  const packages = input.packages ?? SELF_UPDATE_PACKAGES;
  const kept = versionDirOf(input.versionsDir, input.version);
  return packages.map((pkg) =>
    profileLinkOf(
      input.profileDir,
      pkg,
      linkTargetOf(join(input.profileDir, 'node_modules', pkg)) ?? join(kept, 'node_modules', pkg),
    ),
  );
}

export function carryPreviousVersion(input: {
  readonly profileDir: string;
  readonly versionsDir: string;
  readonly version: string;
  readonly packages?: readonly string[] | undefined;
}): readonly string[] {
  const packages = input.packages ?? SELF_UPDATE_PACKAGES;
  const kept = versionDirOf(input.versionsDir, input.version);
  const moved: string[] = [];
  for (const pkg of packages) {
    const source = join(input.profileDir, 'node_modules', pkg);
    if (!isRealDir(source)) continue;
    const target = join(kept, 'node_modules', pkg);
    if (existsSync(target)) continue;
    ensureDir(dirname(target));
    moveDir(source, target);
    moved.push(pkg);
  }
  if (moved.length > 0) {
    writeVersionProject(
      versionProjectFiles({ profileDir: input.profileDir, versionsDir: input.versionsDir, version: input.version, packages }),
    );
  }
  return moved;
}

function linkTargetOf(link: string): string | undefined {
  try {
    return lstatSync(link).isSymbolicLink() ? readlinkSync(link) : undefined;
  } catch {
    return undefined;
  }
}

function moveDir(source: string, target: string): void {
  try {
    renameSync(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
    cpSync(source, target, { recursive: true });
    removePath(source);
  }
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

function manifestOf(packages: readonly string[], version: string): Record<string, unknown> {
  const dependencies: Record<string, string> = {};
  for (const name of packages) dependencies[name] = version;
  return { name: `dsh-workbench-versions-${version}`, private: true, dependencies };
}

