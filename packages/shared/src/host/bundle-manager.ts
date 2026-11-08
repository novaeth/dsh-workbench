import type { DshHostContext } from '../api/dsh.js';
import { RESTART_REASONS } from '../contract/protocol/bundle-install.js';
import type { BundleManager } from './adapter-types.js';
import type {
  BundleChange,
  BundleIncompatible,
  BundleInspection,
  BundleRegistries,
  BundleRegistry,
  BundleRegistryAttempt,
  BundleUpdateOutcome,
  BundleUpdateRequest,
  BundleVersionEntry,
  BundleVersionList,
} from '../contract/protocol/bundle-install.js';

export const PLUGIN_MANAGER_SERVICE = 'pluginManager';

interface PluginManagerFace {
  registries?(): Promise<unknown>;
  inspect?(spec: string, options?: { readonly registry?: BundleRegistry }): Promise<unknown>;
  installBundle?(spec: string, options?: unknown): Promise<unknown>;
  removeBundle?(name: string): Promise<unknown>;
  setBundleEnabled?(name: string, enabled: boolean): Promise<unknown>;
  cancelInstall?(requestId: string): Promise<unknown>;
  listVersions?(name: string, options?: { readonly registry?: BundleRegistry }): Promise<unknown>;
  updateBundle?(
    name: string,
    version: string,
    options?: { readonly registry?: BundleRegistry; readonly requestId?: string },
  ): Promise<unknown>;
  waitForInstall?(requestId: string): Promise<unknown>;
}

const APPLICATIONS = ['applied', 'restart-required', 'overridden', 'failed', 'cancelled'] as const;
const STAGES = ['install', 'enable', 'remove'] as const;
const PROBLEMS = [
  'invalid-spec',
  'already-installed',
  'not-found',
  'not-a-package',
  'not-a-bundle',
  'not-a-workbench-module',
  'network',
  'unknown',
] as const;
const SPEC_KINDS = ['registry', 'path', 'git', 'tarball'] as const;
const FAILURE_KINDS = [
  'pnpm-missing',
  'timeout',
  'not-found',
  'no-matching-version',
  'network',
  'disk-full',
  'permission',
  'build-blocked',
  'integrity',
  'unknown',
] as const;
const CANCELLATIONS = ['cancelled', 'too-late', 'not-running'] as const;

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function pick<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function asRegistry(value: unknown): BundleRegistry | undefined {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}

function asTextArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asRegistries(raw: unknown): BundleRegistries | null {
  const record = asRecord(raw);
  if (record === undefined) return null;
  const registry = asRegistry(record.registry);
  if (registry === undefined) return null;
  return {
    registry,
    fallbackRegistries: asTextArray(record.fallbackRegistries),
    resolved: typeof record.resolved === 'string' ? record.resolved : null,
  };
}

function asPackageResult(raw: unknown) {
  const record = asRecord(raw);
  if (record === undefined) return undefined;
  const kind = pick(FAILURE_KINDS, record.kind);
  return {
    exitCode: typeof record.exitCode === 'number' ? record.exitCode : -1,
    output: asText(record.output),
    truncated: record.truncated === true,
    logPath: asText(record.logPath),
    ...(kind === undefined ? {} : { kind }),
  };
}

function asChange(raw: unknown): BundleChange | null {
  const record = asRecord(raw);
  if (record === undefined) return null;
  const application = pick(APPLICATIONS, record.application);
  const stage = pick(STAGES, record.stage);
  if (application === undefined || stage === undefined) return null;
  const error = asRecord(record.error);
  const packageResult = asPackageResult(record.packageResult);
  const pendingBuilds = asTextArray(record.pendingBuilds);
  const restartReason = pick(RESTART_REASONS, record.restartReason);
  const failedAt = pick(['registry', 'spec-host'] as const, record.failedAt);
  const bundle = asText(record.bundle);
  const version = asText(record.version);
  const errorCode = error === undefined ? '' : asText(error.code);
  const errorDetail = error === undefined ? '' : asText(error.diagnostic);
  const incompatible = asIncompatibleList(error?.incompatible);
  return {
    application,
    stage,
    changed: record.changed === true,
    target: asText(record.target),
    ...(bundle === '' ? {} : { bundle }),
    ...(version === '' ? {} : { version }),
    ...(errorCode === '' ? {} : { errorCode }),
    ...(errorDetail === '' ? {} : { errorDetail }),
    ...(incompatible.length === 0 ? {} : { incompatible }),
    ...(packageResult === undefined ? {} : { packageResult }),
    ...(pendingBuilds.length === 0 ? {} : { pendingBuilds }),
    ...(restartReason === undefined ? {} : { restartReason }),
    ...(failedAt === undefined ? {} : { failedAt }),
  };
}

function asInspection(raw: unknown): BundleInspection | null {
  const record = asRecord(raw);
  if (record === undefined) return null;
  const status = asText(record.status);
  if (status === 'refused') {
    const problem = pick(PROBLEMS, record.problem) ?? 'unknown';
    const registries = Array.isArray(record.registries)
      ? record.registries.map(asRegistry).filter((item): item is BundleRegistry => item !== undefined)
      : [];
    return {
      status: 'refused',
      problem,
      reason: asText(record.reason),
      ...(registries.length === 0 ? {} : { registries }),
    };
  }
  if (status !== 'accepted') return null;
  const kind = pick(SPEC_KINDS, record.kind);
  const registry = asRegistry(record.registry);
  if (kind === undefined || registry === undefined) return null;
  const name = asText(record.name);
  const version = asText(record.version);
  const description = asText(record.description);
  const host = asText(record.host);
  return {
    status: 'accepted',
    kind,
    bundle: typeof record.bundle === 'boolean' ? record.bundle : null,
    registry,
    ...(name === '' ? {} : { name }),
    ...(version === '' ? {} : { version }),
    ...(description === '' ? {} : { description }),
    ...(host === '' ? {} : { host }),
  };
}

const VERSION_PROBLEMS = ['not-updatable', 'not-found', 'network', 'unknown'] as const;
const UPDATE_STEPS = ['check', 'remove', 'install'] as const;

function asRequirementMap(value: unknown): Readonly<Record<string, string>> {
  const record = asRecord(value);
  if (record === undefined) return {};
  const entries: [string, string][] = [];
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw === 'string') entries.push([key, raw]);
  }
  return Object.fromEntries(entries);
}

function asIncompatible(raw: unknown): BundleIncompatible | undefined {
  const record = asRecord(raw);
  if (record === undefined) return undefined;
  const name = asText(record.name);
  const version = asText(record.version);
  const runtimeVersion = asText(record.runtimeVersion);
  if (name === '' || version === '' || runtimeVersion === '') return undefined;
  return { name, version, runtimeVersion, requirements: asRequirementMap(record.requirements) };
}

function asIncompatibleList(raw: unknown): BundleIncompatible[] {
  if (!Array.isArray(raw)) return [];
  const rows: BundleIncompatible[] = [];
  for (const item of raw) {
    const entry = asIncompatible(item);
    if (entry !== undefined) rows.push(entry);
  }
  return rows;
}

function asRegistryAttempt(raw: unknown): BundleRegistryAttempt | undefined {
  const record = asRecord(raw);
  if (record === undefined) return undefined;
  const registry = asRegistry(record.registry);
  if (registry === undefined) return undefined;
  const problem = pick(VERSION_PROBLEMS, record.problem);
  const reason = asText(record.reason);
  return {
    registry,
    ...(problem === undefined ? {} : { problem }),
    ...(reason === '' ? {} : { reason }),
  };
}

function asRegistryAttempts(raw: unknown): BundleRegistryAttempt[] {
  if (!Array.isArray(raw)) return [];
  const rows: BundleRegistryAttempt[] = [];
  for (const item of raw) {
    const attempt = asRegistryAttempt(item);
    if (attempt !== undefined) rows.push(attempt);
  }
  return rows;
}

function asVersionEntry(raw: unknown): BundleVersionEntry | null {
  const record = asRecord(raw);
  if (record === undefined) return null;
  const version = asText(record.version);
  if (version === '') return null;
  const publishedAt = asText(record.publishedAt);
  const deprecated = asText(record.deprecated);
  const incompatible = asIncompatible(record.incompatible);
  return {
    version,
    tags: asTextArray(record.tags),
    prerelease: record.prerelease === true,
    bundle: record.bundle === true,
    ...(publishedAt === '' ? {} : { publishedAt }),
    ...(deprecated === '' ? {} : { deprecated }),
    ...(incompatible === undefined ? {} : { incompatible }),
  };
}

function asVersionList(raw: unknown): BundleVersionList | null {
  const record = asRecord(raw);
  if (record === undefined) return null;
  const status = asText(record.status);
  const attempts = asRegistryAttempts(record.attempts);
  if (status === 'refused') {
    return {
      status: 'refused',
      problem: pick(VERSION_PROBLEMS, record.problem) ?? 'unknown',
      reason: asText(record.reason),
      attempts,
    };
  }
  if (status !== 'listed') return null;
  const registry = asRegistry(record.registry);
  const versions: BundleVersionEntry[] = [];
  if (Array.isArray(record.versions)) {
    for (const item of record.versions) {
      const entry = asVersionEntry(item);
      if (entry !== null) versions.push(entry);
    }
  }
  return {
    status: 'listed',
    installed: asText(record.installed),
    registry: registry ?? null,
    attempts,
    versions,
    omitted: typeof record.omitted === 'number' ? record.omitted : 0,
  };
}

function asUpdateOutcome(raw: unknown): BundleUpdateOutcome | null {
  const record = asRecord(raw);
  if (record === undefined) return null;
  const step = pick(UPDATE_STEPS, record.step);
  const change = asChange(record.result);
  if (step === undefined || change === null) return null;
  const restore = record.restore === undefined ? null : asChange(record.restore);
  return {
    from: asText(record.from),
    to: asText(record.to),
    step,
    change,
    ...(restore === null ? {} : { restore }),
  };
}

export function readBundleManager(ctx: DshHostContext): BundleManager | undefined {
  const face = ctx.get<PluginManagerFace>(PLUGIN_MANAGER_SERVICE);
  if (face === undefined) return undefined;
  if (typeof face.installBundle !== 'function' || typeof face.removeBundle !== 'function') return undefined;
  return {
    async registries() {
      if (typeof face.registries !== 'function') return null;
      return asRegistries(await face.registries());
    },
    async inspect(spec, registry) {
      if (typeof face.inspect !== 'function') return null;
      return asInspection(await face.inspect(spec, registry === undefined ? undefined : { registry }));
    },
    async install(request) {
      const options = {
        ...(request.registry === undefined ? {} : { registry: request.registry }),
        ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
        ...(request.approvedBuilds === undefined ? {} : { approvedBuilds: request.approvedBuilds }),
      };
      return asChange(await face.installBundle?.(request.spec, options));
    },
    async remove(name) {
      return asChange(await face.removeBundle?.(name));
    },
    async setEnabled(name, enabled) {
      if (typeof face.setBundleEnabled !== 'function') return null;
      return asChange(await face.setBundleEnabled(name, enabled));
    },
    async cancel(requestId) {
      if (typeof face.cancelInstall !== 'function') return null;
      return pick(CANCELLATIONS, (asRecord(await face.cancelInstall(requestId)) ?? {}).status) ?? null;
    },
    async listVersions(name, registry) {
      if (typeof face.listVersions !== 'function') return null;
      return asVersionList(await face.listVersions(name, registry === undefined ? undefined : { registry }));
    },
    async updateBundle(name, version, request: BundleUpdateRequest = {}) {
      if (typeof face.updateBundle !== 'function') return null;
      const options = {
        ...(request.registry === undefined ? {} : { registry: request.registry }),
        ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
      };
      return asUpdateOutcome(await face.updateBundle(name, version, options));
    },
    async waitForInstall(requestId) {
      if (typeof face.waitForInstall !== 'function') return null;
      return asChange(await face.waitForInstall(requestId));
    },
  };
}
