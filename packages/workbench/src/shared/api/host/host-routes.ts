import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import { basename } from 'node:path';
import type { FactLog, RouteTable } from '@dsh-workbench/shared/host';
import { changesHandler, healthHandler } from '@dsh-workbench/shared/host';
import { dshHome } from '@dsh-workbench/shared/host';
import type { OpencliResolution } from '@/shared/api/host/opencli-command';
import { dshPluginsHandler } from '@/shared/api/host/dsh-plugins';
import { DSH_PLUGINS_ROUTE } from '@/shared/api/dsh-plugins';
import {
  bundleInspectHandler,
  bundleRegistriesHandler,
  moduleVersionsHandler,
} from '@/shared/api/host/bundle-routes';
import {
  BUNDLE_INSPECT_ROUTE,
  BUNDLE_REGISTRIES_ROUTE,
  MODULE_VERSIONS_ROUTE,
} from '@/shared/api/bundle-install';
import { profileDirOf } from '@/shared/api/host/installed-module';
import { readSelfUpdateView } from '@/shared/api/host/self-update';

export function createHostRoutes(input: {
  readonly ctx: DshHostContext;
  readonly facts: FactLog;
  readonly opencli: OpencliResolution;
  readonly running: string | undefined;
}): RouteTable {
  const { ctx, facts, opencli, running } = input;
  return {
    health: healthHandler(ctx, opencli),
    changes: changesHandler(facts),
    [DSH_PLUGINS_ROUTE]: dshPluginsHandler(ctx),
    [BUNDLE_REGISTRIES_ROUTE]: bundleRegistriesHandler(ctx),
    [BUNDLE_INSPECT_ROUTE]: bundleInspectHandler(ctx),
    [MODULE_VERSIONS_ROUTE]: moduleVersionsHandler(
      ctx,
      ctx.get<DshShell>('shell'),
      running,
      () => readSelfUpdateView(dshHome(), basename(profileDirOf(ctx) ?? '')),
    ),
  };
}
