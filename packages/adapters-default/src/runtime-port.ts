import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DshHostContext } from '@dsh-workbench/shared';
import type { RuntimePort } from '@dsh-workbench/shared/host';
import { libsBinDir } from '@dsh-workbench/shared/host';
import { ensureLibsOpencliPeer, opencliCommandOf, opencliRunnerOf } from '@dsh-workbench/adapter-runtime';
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

export function runtimePathDirs(
  paths: ReturnType<typeof runtimeSeedPaths>,
): readonly string[] {
  return [paths.opencliBinDir, libsBinDir(), paths.entryDir];
}

export function prependRuntimePath(
  paths: ReturnType<typeof runtimeSeedPaths>,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  const added: string[] = [];
  for (const dir of [...runtimePathDirs(paths)].reverse()) {
    if (prependPath(dir, env)) added.push(dir);
  }
  return added;
}

const OPENCLI_RUNNER_TIMEOUT_MS = 30 * 60_000;

export function createRuntimePort(): RuntimePort {
  return {
    packageRoot: packageRootOf,
    warnUnwritableRoot,

    capabilities() {
      return {
        console: true,
        pluginMarket: true,
        browserBridge: true,
        libs: true,
      };
    },

    profile() {
      return {
        label: 'opencli',
        terms: {
          plugin: 'opencli 插件',
          pluginOf: 'opencli 的插件',
          pluginThing: 'opencli 插件',
          pluginArea: 'opencli 的插件区',
        },
        installHint: '确认 opencli 已经装好、在终端里能直接运行（which opencli）。',
        diagnose: {
          exec: '确认 opencli 已经装好、在终端里能直接运行（which opencli）。',
          login: '在工作台的浏览器桥里登录一次；登录态会一直留着。',
          bridge: '后台浏览器没起来，重试一次通常就好。',
        },
      };
    },

    commands(ctx) {
      return { opencli: opencliCommandOf(ctx).command };
    },

    runners(ctx, data) {
      return {
        opencli: opencliRunnerOf((request) => data.read(request), {
          timeoutMs: OPENCLI_RUNNER_TIMEOUT_MS,
        }),
      };
    },

    health(ctx) {
      return { opencli: opencliCommandOf(ctx) };
    },

    seed(ctx: DshHostContext, options) {
      const root = runtimeSeedRootOf(ctx);
      if (root === null) return;
      const home = dirname(root);
      const packageRoot = packageRootOf(options.corePackageUrl);
      const paths = runtimeSeedPaths(root);
      const log = options.log;
      for (const file of seedRuntimeFiles({ root, home, packageRoot, log })) log(`自举写下 ${file}`);
      ensureLibsOpencliPeer();
      for (const dir of prependRuntimePath(paths)) log(`PATH 前插 ${dir}`);
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
