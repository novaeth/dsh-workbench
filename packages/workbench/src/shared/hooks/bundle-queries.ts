import type { ApiResponse, Query } from '@dsh-workbench/shared';
import { apiGet } from '@dsh-workbench/shared';
import {
  BUNDLE_INSPECT_ROUTE,
  BUNDLE_REGISTRIES_ROUTE,
  MODULE_VERSIONS_ROUTE,
  type BundleInspectionPayload,
  type BundleRegistriesPayload,
  type ModuleVersionsPayload,
} from '@/shared/api/bundle-install';
import {
  INSTALLED_PLUGINS_ROUTE,
  type InstalledPluginsPayload,
} from '@/shared/api/installed-plugins';

export function readBundleRegistries(): Promise<ApiResponse<BundleRegistriesPayload>> {
  return apiGet<BundleRegistriesPayload>(BUNDLE_REGISTRIES_ROUTE);
}

export function readBundleInspection(spec: string, registry?: string): Promise<ApiResponse<BundleInspectionPayload>> {
  const query: Query = { spec, ...(registry === undefined || registry === '' ? {} : { registry }) };
  return apiGet<BundleInspectionPayload>(BUNDLE_INSPECT_ROUTE, query);
}

export function readModuleVersions(force = false): Promise<ApiResponse<ModuleVersionsPayload>> {
  return apiGet<ModuleVersionsPayload>(MODULE_VERSIONS_ROUTE, force ? { force: '1' } : undefined);
}

export function readInstalledPlugins(force = false): Promise<ApiResponse<InstalledPluginsPayload>> {
  return apiGet<InstalledPluginsPayload>(INSTALLED_PLUGINS_ROUTE, force ? { force: '1' } : undefined);
}
