import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import { basename } from 'node:path';
import type { FactLog, ProfilePort, RouteTable } from '@dsh-workbench/shared/host';
import { changesHandler, healthHandler } from '@dsh-workbench/shared/host';
import { dshHome } from '@dsh-workbench/shared/host';
import type { OpencliResolution } from '@dsh-workbench/shared/host';
import { DSH_PLUGINS_ROUTE } from '@/kernel/contract/dsh-plugins';
import {
  bundleInspectHandler,
  bundleRegistriesHandler,
  moduleVersionsHandler,
} from '@/shared/api/host/bundle-routes';
import {
  BUNDLE_INSPECT_ROUTE,
  BUNDLE_REGISTRIES_ROUTE,
  MODULE_VERSIONS_ROUTE,
} from '@/kernel/contract/bundle-install';
export function createHostRoutes(input: {
  readonly ctx: DshHostContext;
  readonly facts: FactLog;
  readonly opencli: OpencliResolution;
  readonly running: string | undefined;
  readonly profile: ProfilePort;
}): RouteTable {
  const { ctx, facts, opencli, running, profile } = input;
  return {
    health: healthHandler(ctx, opencli),
    changes: changesHandler(facts),
    [DSH_PLUGINS_ROUTE]: profile.dshPlugins(ctx),
    [BUNDLE_REGISTRIES_ROUTE]: bundleRegistriesHandler(ctx),
    [BUNDLE_INSPECT_ROUTE]: bundleInspectHandler(ctx),
    [MODULE_VERSIONS_ROUTE]: moduleVersionsHandler(
      ctx,
      ctx.get<DshShell>('shell'),
      running,
      () => profile.selfUpdateView(dshHome(), basename(profile.dirOf(ctx) ?? '')),
    ),
  };
}
