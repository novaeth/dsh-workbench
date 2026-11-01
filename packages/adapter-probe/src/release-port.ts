import { createReleasePort } from '@dsh-workbench/adapter-profile';
import { vendorPrefix } from '@dsh-workbench/adapter-runtime';

const port = createReleasePort({ prefix: vendorPrefix() });

export const latestVersion = port.latestVersion;
export const missingReleaseParts = port.missingReleaseParts;
export const probeRelease = port.probeRelease;
export const resetReleaseCache = port.reset;
