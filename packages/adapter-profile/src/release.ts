import type { DshShell } from '@dsh-workbench/shared';
import type { PluginRelease } from '@dsh-workbench/shared';
import { createReleaseProbe, parseLedgerVersion } from '@dsh-workbench/shared/host';

export { parseLedgerVersion };
export { compareVersions, isNewerVersion } from '@dsh-workbench/shared/host';

export interface ReleasePort {
  latestVersion(options: {
    readonly shell: DshShell;
    readonly name: string;
    readonly registry: string;
    readonly force?: boolean;
  }): Promise<string | undefined>;
  missingReleaseParts(options: {
    readonly shell: DshShell;
    readonly name: string;
    readonly registry: string;
    readonly version: string;
    readonly force?: boolean;
  }): Promise<readonly string[]>;
  probeRelease(options: {
    readonly shell: DshShell;
    readonly package: string;
    readonly registry?: string | undefined;
    readonly force?: boolean;
  }): Promise<PluginRelease | undefined>;
  reset(): void;
}

export function createReleasePort(options: {
  readonly cacheDir: string;
  readonly prefix: string;
}): ReleasePort {
  const probe = createReleaseProbe();
  return {
    latestVersion: (call) => probe.latestVersion({ ...call, cacheDir: options.cacheDir }),
    missingReleaseParts: (call) => probe.missingReleaseParts({ ...call, cacheDir: options.cacheDir }),
    probeRelease: (call) => probe.probeRelease({ ...call, cacheDir: options.cacheDir, prefix: options.prefix }),
    reset: () => {
      probe.reset();
    },
  };
}
