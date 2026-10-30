import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DshHostContext } from '@dsh-workbench/shared';
import type { RuntimePort } from '@dsh-workbench/shared/host';
import { packageRootOf } from '@dsh-workbench/shared/host';
import { backgroundLine, libsBinDir } from '@dsh-workbench/adapter-runtime';

import { ensureLibsOpencliPeer, opencliCommandOf, opencliRunnerOf } from '@dsh-workbench/adapter-runtime';
import {
  isInstalledCopy,
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
      };
    },

    profile() {
      return {
        label: 'opencli',
        terms: {
          plugin: { zh: 'opencli 插件', en: 'opencli plugin' },
          pluginOf: { zh: 'opencli 的插件', en: 'an opencli plugin' },
          pluginThing: { zh: 'opencli 插件', en: 'an opencli plugin' },
          pluginArea: { zh: 'opencli 的插件区', en: 'the opencli plugin area' },
        },
        installHint: {
          zh: '确认 opencli 已经装好、在终端里能直接运行。',
          en: 'Make sure opencli is installed and runs from your terminal.',
        },
        diagnose: {
          exec: {
            zh: '确认 opencli 已经装好、在终端里能直接运行。',
            en: 'Make sure opencli is installed and runs from your terminal.',
          },
          login: {
            zh: '在工作台的浏览器桥里登录一次；登录态会一直留着。',
            en: 'Sign in once through the workbench browser bridge; the session stays.',
          },
          bridge: {
            zh: '后台浏览器没起来，重试一次通常就好。',
            en: 'The background browser is not up; a retry usually fixes it.',
          },
        },
        bridge: {
          daemon: {
            text: {
              zh: '后台服务没起来：正常它会自己起，先在终端跑下面这条命令。',
              en: 'The opencli daemon is not running. It usually starts by itself — run the command below in your terminal first.',
            },
          },
          extension: {
            text: {
              zh: '浏览器扩展没连上：确认浏览器开着、扩展已启用；没装就从商店装一次（装完回来点「重试」）。',
              en: 'The opencli browser extension is not connected. Make sure the browser is running and the extension is enabled; install it once from the store if needed (then hit Retry here).',
            },
            link: {
              label: { zh: '去 Chrome 应用商店装扩展', en: 'Get the extension in the Chrome Web Store' },
              href: 'https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk',
            },
          },
          profile: {
            text: {
              zh: '连上了多个浏览器账号，但没选默认的那个：先看有哪些（下面这条命令），再选一个。',
              en: 'Several browser accounts are connected but none is the default: list them (command below), then pick one.',
            },
          },
          stale: {
            text: {
              zh: '默认的浏览器账号已经失效（它记的是上一次的扩展实例）：重新选一个。',
              en: 'The default browser account is stale (it names an extension instance that no longer exists): pick one again.',
            },
          },
        },
      };
    },

    commandSurface() {
      return {
        name: 'opencli',
        pluginPrefix: 'opencli-plugin-',
        invoke: (site: string, command?: string) =>
          command === undefined || command === '' ? `opencli ${site}` : `opencli ${site} ${command}`,
        help: (site: string) => `opencli ${site} --help`,
        browser: (verb: readonly string[]) => `opencli browser ${verb.join(' ')}`,
        background: (command: string, argv: readonly string[]) => backgroundLine(command, argv),
        authorHint: 'opencli skills read opencli-adapter-author',
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
