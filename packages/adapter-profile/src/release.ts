import type { DshShell } from '@dsh-workbench/shared';
import type { PluginRelease } from '@dsh-workbench/shared';
import {
  createReleaseProbe,
  parseLedgerVersion,
} from '@dsh-workbench/shared/host';
import { npmCacheDir, vendorPrefix } from '@dsh-workbench/adapter-runtime';

const probe = createReleaseProbe();

export { parseLedgerVersion };
export function resetReleaseCache(): void {
  probe.reset();
}
export { compareVersions, isNewerVersion } from '@dsh-workbench/shared/host';

export async function latestVersion(options: {
  shell: DshShell;
  name: string;
  registry: string;
  force?: boolean;
}): Promise<string | undefined> {
  return probe.latestVersion({ ...options, cacheDir: npmCacheDir() });
}

export async function missingReleaseParts(options: {
  shell: DshShell;
  name: string;
  registry: string;
  version: string;
  force?: boolean;
}): Promise<readonly string[]> {
  return probe.missingReleaseParts({ ...options, cacheDir: npmCacheDir() });
}

export async function probeRelease(options: {
  shell: DshShell;
  package: string;
  registry?: string | undefined;
  force?: boolean;
}): Promise<PluginRelease | undefined> {
  return probe.probeRelease({ ...options, cacheDir: npmCacheDir(), prefix: vendorPrefix() });
}
