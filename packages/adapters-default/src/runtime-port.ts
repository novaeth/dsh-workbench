import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DshHostContext } from '@dsh-workbench/shared';
import type { RuntimePort } from '@dsh-workbench/shared/host';
import { opencliCommandOf } from '@dsh-workbench/adapter-runtime';
import {
  isInstalledCopy,
  packageRootOf,
  prependPath,
  runDetached,
  runtimeSeedPaths,
  runtimeSeedRootOf,
  seedRuntimeFiles,
  seedWorkbenchToolchain,
  warnUnwritableRoot,
  workshopSeedPlan,
} from '@dsh-workbench/adapter-probe';

export function createRuntimePort(): RuntimePort {
  return {
    packageRoot: packageRootOf,
    opencliCommand: opencliCommandOf,
    warnUnwritableRoot,

    seed(ctx: DshHostContext, options) {
      const root = runtimeSeedRootOf(ctx);
      if (root === null) return;
      const home = dirname(root);
      const packageRoot = packageRootOf(options.corePackageUrl);
      const paths = runtimeSeedPaths(root);
      const log = options.log;
      for (const file of seedRuntimeFiles({ root, home, packageRoot, log })) log(`自举写下 ${file}`);
      if (prependPath(paths.entryDir)) log(`PATH 前插 ${paths.entryDir}`);
      seedWorkbenchToolchain(root, log);
      const plan = workshopSeedPlan(packageRoot, home, root);
      runDetached(plan.entry, log);
      const workshopReady =
        existsSync(paths.workshopManifest) && existsSync(join(paths.workshop, 'node_modules'));
      if (isInstalledCopy(packageRoot) && !workshopReady) {
        log('DIY 工坊骨架不在：后台建起来（第一次会下载依赖，几百 MB）');
        runDetached(plan.full, log);
      }
    },
  };
}
