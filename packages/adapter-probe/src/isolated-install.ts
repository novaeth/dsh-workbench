import { installWithRetry, type InstallAttempt, type InstallRetryResult } from './install-retry.js';

export type IsolatedInstallRun = InstallAttempt;

export interface IsolatedInstallDeps {
  readonly run: (command: string) => Promise<IsolatedInstallRun>;
  readonly resolves: () => boolean;
  readonly drop: () => void;
  readonly log?: ((message: string) => void) | undefined;
}

export type IsolatedInstallResult = InstallRetryResult;

export async function installIsolatedRuntime(
  deps: IsolatedInstallDeps,
  command: string,
): Promise<IsolatedInstallResult> {
  return installWithRetry(deps, command, {
    what: 'opencli',
    dropLabel: 'toolchain/node_modules',
    mismatch: '第一遍没装上（下载缓存和已有的 node_modules 对不上）',
    unresolved: '第一遍装完还是读不到',
    settled: '装好了',
    unresolvedAgain: '还是读不到',
    failedAgain: '还是没装上',
  });
}
