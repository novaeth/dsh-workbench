import type { DshShell } from '@dsh-workbench/shared';
import { PLUGIN_ID } from '@dsh-workbench/shared/host';
import { requireSupply } from '@dsh-workbench/shared/host';
import type { InstalledModule, ProfilePackage, SupplyPort } from '@dsh-workbench/shared/host';
import type { SelfUpdateRequest, SelfUpdateStart } from '@dsh-workbench/shared/host';
import type { BundleInstallOutcome } from './market-types';

export interface WorkbenchUpdateDeps {
  readonly asked: string;
  readonly workbench?: ((pkg: string) => ProfilePackage | undefined) | undefined;
  readonly shell?: DshShell | undefined;
  readonly installed?: ((pkg: string) => InstalledModule) | undefined;
  readonly dshHome?: (() => string) | undefined;
  readonly profileRegistry?: (() => Promise<string | undefined>) | undefined;
  readonly profileName?: (() => string | null) | undefined;
  readonly selfUpdate?:
    | ((request: SelfUpdateRequest, onError: (message: string) => void) => SelfUpdateStart)
    | undefined;
  readonly logger?: { info?(message: string): void; warn?(message: string): void } | undefined;
  readonly supply?: SupplyPort | undefined;
}

export async function updateWorkbenchOnce(deps: WorkbenchUpdateDeps): Promise<BundleInstallOutcome> {
  const supply = deps.supply ?? requireSupply();
  const asked = deps.asked.trim();
  const target = asked === '' ? PLUGIN_ID : asked;
  if (target !== PLUGIN_ID) {
    throw new Error(`这条路只更新工作台自己那一份（${PLUGIN_ID}）：${target}`);
  }
  const read = deps.workbench?.(target);
  if (read === undefined) {
    throw new Error(`读不到 profile 里装的 ${target} —— 没法判断装的是哪一份，更新做不了。`);
  }
  if (read.local === true) {
    throw new Error('这份工作台是从源码目录装进来的（开发副本），不从源上更新。');
  }
  const shell = deps.shell;
  const registry = read.registry ?? (await deps.profileRegistry?.());
  const askedLatest =
    shell === undefined || registry === undefined
      ? undefined
      : await supply.latestVersion({ shell, name: read.pkg, registry, force: true });
  if (shell !== undefined && registry !== undefined && askedLatest !== undefined) {
    const missing = await supply.missingReleaseParts({
      shell,
      name: read.pkg,
      registry,
      version: askedLatest,
      force: true,
    });
    if (missing.length > 0) {
      throw new Error(
        `源上已经有 ${read.pkg}@${askedLatest}，但这一份发布还没铺齐：${missing.join('、')} 在这一版上还拉不到。装上会缺依赖，稍等再试 —— 市场页那颗「重新检查」会重新探一次。`,
      );
    }
  }
  const home = deps.dshHome?.();
  const profile = deps.profileName?.();
  if (home === undefined || profile === undefined || profile === null) {
    throw new Error('拿不到 DSH_HOME 或 profile 名字 —— 自更新要多一个进程在外头跑，这一步做不了。');
  }
  const spec =
    askedLatest === undefined ? `${read.pkg}@latest` : `${read.pkg}@${askedLatest}`;
  const run = deps.selfUpdate ?? deps.supply?.startSelfUpdate ?? (() => { throw new Error('self-update 适配器未提供'); });
  const started = run(
    {
      dshHome: home,
      profile,
      pkg: read.pkg,
      from: read.version,
      to: askedLatest ?? '',
      pinned: askedLatest !== undefined,
    },
    (message: string) => deps.logger?.warn?.(`[dsh-workbench] ${message}`),
  );
  deps.logger?.info?.(
    `[dsh-workbench] 自更新交给外部执行器（${started.paths.script}）：${read.version} → ${askedLatest ?? '最新版'}，这一跳不掉自己那一行`,
  );
  return {
    change: {
      application: 'restart-required',
      stage: 'install',
      changed: false,
      target: spec,
      bundle: read.pkg,
    },
    module: deps.installed?.(read.pkg) ?? { kind: 'unknown', pkg: read.pkg },
    supply: { state: 'no-needs' },
  };
}
