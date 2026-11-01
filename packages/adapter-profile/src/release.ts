import type { PluginRelease } from '@dsh-workbench/shared';
import type { Seam } from '@dsh-workbench/shared/host';
import { createReleaseProbe, parseLedgerVersion } from '@dsh-workbench/shared/host';

export { parseLedgerVersion };
export { compareVersions, isNewerVersion } from '@dsh-workbench/shared/host';

export interface ReleasePort {
  latestVersion(options: {
    readonly seam: Seam;
    readonly name: string;
    readonly registry: string;
    readonly force?: boolean;
  }): Promise<string | undefined>;
  missingReleaseParts(options: {
    readonly seam: Seam;
    readonly name: string;
    readonly registry: string;
    readonly version: string;
    readonly force?: boolean;
  }): Promise<readonly string[]>;
  probeRelease(options: {
    readonly seam: Seam;
    readonly package: string;
    readonly registry?: string | undefined;
    readonly force?: boolean;
  }): Promise<PluginRelease | undefined>;
  reset(): void;
}

export function createReleasePort(options: {
  readonly prefix: string;
}): ReleasePort {
  const probe = createReleaseProbe();
  return {
    latestVersion: (call) => probe.latestVersion(call),
    missingReleaseParts: (call) => probe.missingReleaseParts(call),
    probeRelease: (call) => probe.probeRelease({ ...call, prefix: options.prefix }),
    reset: () => {
      probe.reset();
    },
  };
}
