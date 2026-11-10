import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SelfUpdateRollbackRequest, SelfUpdateRollbackStart } from '@dsh-workbench/shared/host';
import { writeJsonFile } from '@dsh-workbench/shared/host';
import { selfUpdatePaths, SELF_UPDATE_PACKAGES, type SelfUpdateMarker } from './self-update-plan.js';
import { flipProfileLinks, versionDirOf, versionLinksOf, versionSelfCheck, writeProfileLinks } from './version-dir.js';

function readMarker(file: string): SelfUpdateMarker | undefined {
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof raw !== 'object' || raw === null) return undefined;
    return raw as SelfUpdateMarker;
  } catch {
    return undefined;
  }
}

export function rollbackSelfUpdate(request: SelfUpdateRollbackRequest, at: string): SelfUpdateRollbackStart {
  const paths = selfUpdatePaths();
  const marker = readMarker(paths.marker);
  if (marker === undefined) return { ok: false, refusal: 'no-marker' };
  const profileDir = join(request.dshHome, 'profiles', request.profile);
  const versionDir = versionDirOf(paths.versionsDir, request.version);
  if (!versionSelfCheck({ versionDir, version: request.version, packages: SELF_UPDATE_PACKAGES })) {
    return { ok: false, refusal: 'no-previous' };
  }
  const links = versionLinksOf({ profileDir, versionDir, packages: SELF_UPDATE_PACKAGES });
  flipProfileLinks(links);
  writeProfileLinks({ profileDir, links });
  writeJsonFile(paths.marker, { ...marker, state: 'rolled-back', version: request.version, at });
  return { ok: true, version: request.version };
}
