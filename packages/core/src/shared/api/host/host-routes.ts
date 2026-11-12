import type { DshHostContext } from '@dsh-workbench/shared/host';
import { basename } from 'node:path';
import type { FactLog, ProfilePort, RouteTable } from '@dsh-workbench/shared/host';
import { changesHandler, healthHandler, seamOf } from '@dsh-workbench/shared/host';
import type { RuntimeStatus } from '@dsh-workbench/shared/host';
import { DSH_PLUGINS_ROUTE } from '@/kernel/contract/dsh-plugins';
import { WORKBENCH_SETTINGS_SERVICE, type WorkbenchSettingsStore } from '@/shared/api/host/workbench-settings';
import {
  bundleInspectHandler,
  bundleRegistriesHandler,
  moduleVersionsHandler,
} from '@/shared/api/host/bundle-routes';
import { gitProbeHandler } from '@/shared/api/host/git-routes';
import {
  BUNDLE_INSPECT_ROUTE,
  BUNDLE_REGISTRIES_ROUTE,
  MODULE_VERSIONS_ROUTE,
} from '@/kernel/contract/bundle-install';
import { MARKET_GIT_PROBE_ROUTE } from '@/kernel/contract/market-index';
export function createHostRoutes(input: {
  readonly ctx: DshHostContext;
  readonly facts: FactLog;
  readonly runtimes: Readonly<Record<string, RuntimeStatus>>;
  readonly running: string | undefined;
  readonly profile: ProfilePort;
}): RouteTable {
  const { ctx, facts, runtimes, running, profile } = input;
  const includePrerelease = (): boolean =>
    (ctx.get(WORKBENCH_SETTINGS_SERVICE) as WorkbenchSettingsStore | undefined)?.read().includePrerelease === true;
  return {
    health: healthHandler(ctx, runtimes),
    changes: changesHandler(facts),
    [DSH_PLUGINS_ROUTE]: profile.dshPlugins(ctx),
    [BUNDLE_REGISTRIES_ROUTE]: bundleRegistriesHandler(ctx),
    [BUNDLE_INSPECT_ROUTE]: bundleInspectHandler(ctx),
    [MARKET_GIT_PROBE_ROUTE]: gitProbeHandler(),
    [MODULE_VERSIONS_ROUTE]: moduleVersionsHandler(
      ctx,
      seamOf(ctx),
      running,
      () => profile.selfUpdateView(basename(profile.dirOf(ctx) ?? '')),
      includePrerelease,
    ),
  };
}
