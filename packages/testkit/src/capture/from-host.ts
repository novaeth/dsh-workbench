import type { CapabilityPayload } from '@dsh-workbench/shared';
import type {
  BundleInspectionPayload,
  BundleRegistriesPayload,
  ModuleVersionsPayload,
} from '@dsh-workbench/shared/contract/protocol/bundle-install';
import type { PanelsPayload } from '@dsh-workbench/shared/contract/protocol/panels';
import type { UnitManifestsPayload } from '@dsh-workbench/shared/contract/protocol/unit-manifests';
import type { InstalledModule, WorkbenchState, World } from '../world/types';
import { captured } from '../world/provenance';

export interface CapturedMeta {
  readonly hostVersion: string;
  readonly dshVersion?: string;
  readonly capturedAt: string;
  readonly source: string;
}

export interface CapturedHost {
  readonly meta: CapturedMeta;
  readonly unitManifests: UnitManifestsPayload & {
    readonly refusals?: readonly { readonly unit: string; readonly pkg: string; readonly reasons: readonly string[] }[];
  };
  readonly moduleVersions: ModuleVersionsPayload;
  readonly panels: PanelsPayload;
  readonly capability: { readonly units: readonly CapabilityPayload[] };
  readonly marketInstalled?: { readonly modules: readonly unknown[] };
  readonly installedPlugins?: { readonly plugins: readonly unknown[] };
  readonly bundleRegistries?: BundleRegistriesPayload;
  readonly bundleInspect?: { readonly inspection: unknown };
  readonly bundleInspectSpec?: string;
}

export function worldOfCaptured(input: CapturedHost): World {
  const versions = new Map((input.moduleVersions.modules ?? []).map((row) => [row.unit, row]));
  const refusals = new Map((input.unitManifests.refusals ?? []).map((row) => [row.unit, row.reasons]));
  const workbench: WorkbenchState = input.moduleVersions.workbench ?? {
    pkg: '@dsh-workbench/core',
    installed: input.meta.hostVersion,
  };
  const modules: InstalledModule[] = input.unitManifests.manifests.map((manifest) => {
    const version = versions.get(manifest.id);
    return {
      unit: manifest.id,
      pkg: version?.pkg ?? '@dsh-workbench/core',
      title: version?.title ?? { zh: manifest.id, en: manifest.id },
      installed: version?.installed ?? workbench.installed,
      manifest,
      installable: input.unitManifests.installable.includes(manifest.id),
      packageModule: version !== undefined,
      ...(version?.latest === undefined ? {} : { latest: version.latest }),
      ...(version?.local === true ? { local: true } : {}),
      ...(version?.spec === undefined ? {} : { spec: version.spec }),
      ...(version?.latestUnavailable === undefined ? {} : { latestUnavailable: version.latestUnavailable }),
      ...(version?.latestBlocked === undefined ? {} : { latestBlocked: version.latestBlocked }),
      ...(refusals.get(manifest.id) === undefined ? {} : { refused: refusals.get(manifest.id) }),
    };
  });
  return {
    schemaVersion: 1,
    provenance: captured(input.meta.hostVersion, input.meta.capturedAt),
    machine: {
      modules,
      plugins: input.panels.plugins.map((plugin) => ({
        pkg: plugin.pkg,
        ...(plugin.name === undefined ? {} : { name: plugin.name }),
      })),
      capabilities: input.capability.units,
      workbench,
      preflight: { phase: 'ready', at: 0, steps: [] },
    },
    workspaces: [
      {
        id: 'captured',
        path: '/repo',
        units: input.panels.units.map((unit) => ({
          unit: unit.id,
          shown: unit.shown,
          source: unit.source,
          ...(unit.order === undefined ? {} : { order: unit.order }),
        })),
        plugins: input.panels.plugins.map((plugin) => ({
          pkg: plugin.pkg,
          shown: plugin.shown,
          source: plugin.source,
        })),
        defaults: input.panels.defaults,
        changed: input.panels.changed,
        own: input.panels.own,
      },
    ],
    market: { sources: [] },
    faults: {},
    writes: {},
    ...(input.bundleRegistries === undefined
      ? {}
      : {
          bundle: {
            registries: input.bundleRegistries,
            ...(input.bundleInspect === undefined || input.bundleInspectSpec === undefined
              ? {}
              : {
                  inspections: {
                    [input.bundleInspectSpec]: input.bundleInspect as BundleInspectionPayload,
                  },
                }),
          },
        }),
  };
}
