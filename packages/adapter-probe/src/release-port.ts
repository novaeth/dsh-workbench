import { createReleasePort } from '@dsh-workbench/adapter-profile';
import { npmCacheDir, vendorPrefix } from '@dsh-workbench/adapter-runtime';

const port = createReleasePort({ cacheDir: npmCacheDir(), prefix: vendorPrefix() });

export const latestVersion = port.latestVersion;
export const missingReleaseParts = port.missingReleaseParts;
export const probeRelease = port.probeRelease;
export const resetReleaseCache = port.reset;
