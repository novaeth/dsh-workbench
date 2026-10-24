import type { DshHostContext } from '@dsh-workbench/shared';
import { RESTART_REASONS } from '@dsh-workbench/shared/contract/protocol/bundle-install';
import type {
  BundleCancellation,
  BundleChange,
  BundleInspection,
  BundleInstallRequest,
  BundleRegistries,
  BundleRegistry,
} from '@dsh-workbench/shared/contract/protocol/bundle-install';

const MANAGER_SERVICE = 'pluginManager';

interface PluginManagerFace {
  registries?(): Promise<unknown>;
  inspect?(spec: string, options?: { readonly registry?: BundleRegistry }): Promise<unknown>;
  installBundle?(spec: string, options?: unknown): Promise<unknown>;
  removeBundle?(name: string): Promise<unknown>;
  setBundleEnabled?(name: string, enabled: boolean): Promise<unknown>;
  cancelInstall?(requestId: string): Promise<unknown>;
}

export interface BundleManager {
  registries(): Promise<BundleRegistries | null>;
  inspect(spec: string, registry?: BundleRegistry): Promise<BundleInspection | null>;
  install(request: BundleInstallRequest): Promise<BundleChange | null>;
  remove(name: string): Promise<BundleChange | null>;
  setEnabled?(name: string, enabled: boolean): Promise<BundleChange | null>;
  cancel(requestId: string): Promise<BundleCancellation | null>;
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
  return {
    application,
    stage,
    changed: record.changed === true,
    target: asText(record.target),
    ...(bundle === '' ? {} : { bundle }),
    ...(version === '' ? {} : { version }),
    ...(errorCode === '' ? {} : { errorCode }),
    ...(errorDetail === '' ? {} : { errorDetail }),
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

export function readBundleManager(ctx: DshHostContext): BundleManager | undefined {
  const face = ctx.get<PluginManagerFace>(MANAGER_SERVICE);
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
  };
}
