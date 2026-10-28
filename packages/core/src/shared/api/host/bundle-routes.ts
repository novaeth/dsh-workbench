import { basename, dirname } from 'node:path';
import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import {
  declarationApiVersionOf,
  declarationProblemsOf,
  param,
  PLUGIN_ID,
  SUPPORTED_API_VERSIONS,
  supplyPortOf,
  UNITS_SERVICE,
  type BundleManager,
  type RouteHandler,
  type UnitTitle,
} from '@dsh-workbench/shared/host';
import type { UnitRefusal } from '@/kernel/host/unit-registry';
import {
  BUNDLE_REGISTRY_DEFAULT,
  type BundleInspectionPayload,
  type BundleRegistriesPayload,
  type BundleRegistry,
  type ModuleUpdateBlock,
  type ModuleVersion,
  type ModuleVersionsPayload,
  type BundleInspection,
  type WorkbenchVersion,
  type WorkbenchSelfUpdate,
} from '@/kernel/contract/bundle-install';
import { migrationFollowUp, type WorkbenchMigrationFollowUp } from './migration-follow-up.js';

function registryOf(search: URLSearchParams): BundleRegistry | undefined {
  const raw = param(search, 'registry');
  if (raw === undefined) return undefined;
  return raw === BUNDLE_REGISTRY_DEFAULT ? null : raw;
}

export function bundleRegistriesHandler(ctx: DshHostContext): RouteHandler {
  return async () => {
    const supply = supplyPortOf(ctx);
    const manager = supply.readBundleManager(ctx);
    const payload: BundleRegistriesPayload =
      manager === undefined
        ? { available: false, registries: null }
        : { available: true, registries: await manager.registries() };
    return { ok: true, ...payload };
  };
}

const refusalLog = new Map<string, string>();

export function resetRefusalLog(): void {
  refusalLog.clear();
}

const holdLog = new Map<string, string>();

export function resetHoldLog(): void {
  holdLog.clear();
}

function updateBlockOf(raw: unknown, problems: readonly string[]): ModuleUpdateBlock | undefined {
  if (problems.length === 0) return undefined;
  const declared = declarationApiVersionOf(raw);
  const newest = Math.max(...SUPPORTED_API_VERSIONS);
  return declared !== undefined && declared > newest ? 'needs-workbench' : 'incompatible';
}

function titleOf(raw: unknown): UnitTitle | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const title = (raw as Readonly<Record<string, unknown>>).title;
  if (typeof title !== 'object' || title === null || Array.isArray(title)) return undefined;
  const record = title as Readonly<Record<string, unknown>>;
  const zh = typeof record.zh === 'string' ? record.zh.trim() : '';
  const en = typeof record.en === 'string' ? record.en.trim() : '';
  if (zh === '' || en === '') return undefined;
  return { zh, en };
}

async function latestIfReleaseReady(supply: ReturnType<typeof supplyPortOf>, input: {
  readonly pkg: string;
  readonly version: string;
  readonly registry: string;
  readonly shell: DshShell;
  readonly force: boolean;
  readonly logger?: { warn?(message: string): void } | undefined;
}): Promise<string | undefined> {
  const missing = await supply.missingReleaseParts({
    shell: input.shell,
    name: input.pkg,
    registry: input.registry,
    version: input.version,
    force: input.force,
  });
  if (missing.length === 0) {
    holdLog.delete(input.pkg);
    return input.version;
  }
  const line = `${input.version}|${missing.join('、')}`;
  if (holdLog.get(input.pkg) !== line) {
    holdLog.set(input.pkg, line);
    input.logger?.warn?.(
      `[dsh-workbench] 源上已经有 ${input.pkg}@${input.version}，但这一份发布还没铺齐（${missing.join('、')} 在这个版本上还拉不到）—— 先不提示更新；等铺齐或点「重新检查」。`,
    );
  }
  return undefined;
}

async function workbenchVersion(supply: ReturnType<typeof supplyPortOf>, input: {
  readonly dir: string | null;
  readonly shell: DshShell | undefined;
  readonly fallback: string | undefined;
  readonly force: boolean;
  readonly running?: string | undefined;
  readonly followUp?: WorkbenchMigrationFollowUp | undefined;
  readonly logger?: { warn?(message: string): void } | undefined;
}): Promise<WorkbenchVersion | undefined> {
  const read = supply.readProfilePackage(input.dir, PLUGIN_ID);
  if (read === undefined) return undefined;
  const registry = read.registry ?? input.fallback;
  const shell = input.shell;
  const queried =
    read.local === true || shell === undefined || registry === undefined
      ? undefined
      : await supply.latestVersion({ shell, name: read.pkg, registry, force: input.force });
  const latest =
    queried === undefined ||
    shell === undefined ||
    registry === undefined ||
    !supply.isNewerVersion(queried, read.version)
      ? undefined
      : await latestIfReleaseReady(supply, {
          pkg: read.pkg,
          version: queried,
          registry,
          shell,
          force: input.force,
          logger: input.logger,
        });
  return {
    pkg: read.pkg,
    installed: read.version,
    ...(latest === undefined ? {} : { latest }),
    ...(input.running === undefined ? {} : { running: input.running }),
    ...(read.local === true ? { local: true } : {}),
    ...(input.followUp === undefined ? {} : { followUp: input.followUp }),
  };
}

export function moduleVersionsHandler(
  ctx: DshHostContext,
  shell: DshShell | undefined,
  running?: string | undefined,
  selfUpdate?: (() => WorkbenchSelfUpdate | undefined) | undefined,
): RouteHandler {
  return async (search) => {
    const supply = supplyPortOf(ctx);
    const manager = supply.readBundleManager(ctx);
    if (manager === undefined) {
      const payload: ModuleVersionsPayload = { modules: [] };
      return { ok: true, ...payload };
    }
    const dir = supply.profileDirOf(ctx);
    const found = supply.profileModules(dir);
    const refusals = new Map<string, readonly string[]>(
      (ctx.get<{ refusals(): readonly UnitRefusal[] }>(UNITS_SERVICE)?.refusals() ?? [])
        .filter((one) => one.unit !== '')
        .map((one) => [one.unit, one.reasons]),
    );
    const force = param(search, 'force') === '1';
    const fallback = (await manager.registries())?.resolved ?? undefined;
    const modules: ModuleVersion[] = await Promise.all(
      found.map(async (module) => {
        const local = module.local === true;
        const fromRegistry = module.fromRegistry !== false;
        const registry = fromRegistry ? (module.registry ?? fallback) : undefined;
        const latest =
          local || !fromRegistry || shell === undefined || registry === undefined
            ? undefined
            : await supply.latestVersion({ shell, name: module.pkg, registry, force });
        const raw = supply.moduleDeclarationOf(dir, module.pkg);
        const declared = raw === undefined ? [] : declarationProblemsOf(module.pkg, raw);
        const title = titleOf(raw);
        const refused = refusals.get(module.unit) ?? (declared.length === 0 ? undefined : declared);
        const latestRaw =
          latest === undefined || latest === module.version || shell === undefined || registry === undefined
            ? undefined
            : await supply.registryDeclarationOf({ shell, name: module.pkg, registry, force });
        const latestBlocked =
          latestRaw === undefined
            ? undefined
            : updateBlockOf(latestRaw, declarationProblemsOf(module.pkg, latestRaw));
        if (refused === undefined) {
          refusalLog.delete(module.pkg);
        } else {
          const line = refused.join('；');
          if (refusalLog.get(module.pkg) !== line) {
            refusalLog.set(module.pkg, line);
            ctx.logger?.warn?.(`[dsh-workbench] ${module.pkg} 装上了但用不了：${line}`);
          }
        }
        return {
          unit: module.unit,
          pkg: module.pkg,
          installed: module.version,
          ...(title === undefined ? {} : { title }),
          ...(latest === undefined ? {} : { latest }),
          ...(latestBlocked === undefined ? {} : { latestBlocked }),
          ...(local
            ? { local: true, latestUnavailable: 'local' as const }
            : latest !== undefined
              ? {}
              : {
                  latestUnavailable: !fromRegistry
                    ? ('not-registry' as const)
                    : registry === undefined
                      ? ('no-registry' as const)
                      : ('probe-failed' as const),
                }),
          ...(refused === undefined ? {} : { refused }),
        };
      }),
    );
    const selfUpdateNow = selfUpdate?.();
    const profile = dir === null ? '' : basename(dir);
    const home = dir === null ? undefined : dirname(dirname(dir));
    const followUp =
      profile === '' || home === undefined
        ? undefined
        : migrationFollowUp({
            home,
            profile,
            ...(process.env.DSH_WORKBENCH_HOME === undefined || process.env.DSH_WORKBENCH_HOME === ''
              ? {}
              : { runtimeRoot: process.env.DSH_WORKBENCH_HOME }),
          });
    const workbench = await workbenchVersion(supply, {
      dir,
      shell,
      fallback,
      force,
      ...(running === undefined ? {} : { running }),
      ...(followUp === undefined ? {} : { followUp }),
      logger: ctx.logger,
    });
    const payload: ModuleVersionsPayload = {
      modules,
      ...(workbench === undefined ? {} : { workbench }),
      ...(selfUpdateNow === undefined ? {} : { selfUpdate: selfUpdateNow }),
    };
    return { ok: true, ...payload };
  };
}

function refusedInspection(problems: readonly string[]): BundleInspection | undefined {
  if (problems.length === 0) return undefined;
  return { status: 'refused', problem: 'not-a-workbench-module', reason: problems.join('；') };
}

async function declarationRefusal(
  supply: ReturnType<typeof supplyPortOf>,
  spec: string,
  inspection: BundleInspection,
  ctx: DshHostContext,
  manager: BundleManager,
): Promise<BundleInspection | undefined> {
  if (inspection.status !== 'accepted' || inspection.name === undefined) return undefined;
  if (inspection.kind === 'path') {
    return refusedInspection(supply.declarationRefusalOf(inspection.name, supply.pathDeclarationOf(spec)));
  }
  if (inspection.kind !== 'registry') return undefined;
  const shell = ctx.get<DshShell>('shell');
  if (shell === undefined) return undefined;
  const registry =
    typeof inspection.registry === 'string'
      ? inspection.registry
      : ((await manager.registries())?.resolved ?? undefined);
  if (registry === undefined) return undefined;
  const raw = await supply.registryDeclarationOf({ shell, name: inspection.name, registry });
  return refusedInspection(supply.declarationRefusalOf(inspection.name, raw));
}

async function packageOverride(
  supply: ReturnType<typeof supplyPortOf>,
  spec: string,
  inspection: BundleInspection,
  ctx: DshHostContext,
  manager: BundleManager,
  asked: BundleRegistry | undefined,
): Promise<BundleInspection | undefined> {
  const shell = ctx.get<DshShell>('shell');
  const fromInspection =
    inspection.status === 'accepted' && typeof inspection.registry === 'string' ? inspection.registry : undefined;
  const registry =
    fromInspection ??
    (typeof asked === 'string' ? asked : ((await manager.registries())?.resolved ?? undefined));
  const route = await supply.packageRouteOf({
    spec,
    ...(shell === undefined ? {} : { shell }),
    ...(registry === undefined ? {} : { registry }),
  });
  if (route !== undefined && route.kind === 'runtime-plugin') {
    if (inspection.status !== 'refused') return undefined;
    const ref = supply.splitNpmSpec(spec);
    return {
      status: 'plugin',
      pkg: route.pkg ?? ref?.name ?? spec.trim(),
      registry: registry ?? null,
      ...(route.pluginName === undefined ? {} : { pluginName: route.pluginName }),
      ...(ref?.version === undefined ? {} : { version: ref.version }),
    };
  }
  return route?.kind === 'neither' && inspection.status === 'accepted'
    ? { status: 'refused', problem: 'not-a-module-or-plugin', reason: supply.refusalReason() }
    : undefined;
}

export function bundleInspectHandler(ctx: DshHostContext): RouteHandler {
  return async (search) => {
    const spec = param(search, 'spec');
    if (spec === undefined) {
      return { ok: false, error: { code: 'workbench/no-spec', message: '要预检哪个包？缺 spec。' } };
    }
    const supply = supplyPortOf(ctx);
    const manager = supply.readBundleManager(ctx);
    if (manager === undefined) {
      return {
        ok: false,
        error: { code: 'workbench/no-bundle-manager', message: '这个 profile 里没有插件管理器，装不了模块。' },
      };
    }
    const asked = registryOf(search);
    const inspection = await manager.inspect(spec, asked);
    if (inspection === null) {
      return {
        ok: false,
        error: { code: 'workbench/bad-inspection', message: '插件管理器回的预检结果看不懂。' },
      };
    }
    const refused =
      (await packageOverride(supply, spec, inspection, ctx, manager, asked)) ??
      (await declarationRefusal(supply, spec, inspection, ctx, manager));
    const payload: BundleInspectionPayload = { inspection: refused ?? inspection };
    return { ok: true, ...payload };
  };
}
