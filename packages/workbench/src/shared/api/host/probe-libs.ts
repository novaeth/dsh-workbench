import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DshShell } from '@dsh-workbench/shared';
import { libDir, libInstallCommand } from '@dsh-workbench/shared/host';
import { isNewerVersion, latestVersion } from './release';
import { resetReleaseCache } from './release';
import { checkVersionRange } from './version-range';
export type { UnitCapability, UnitCommands, UnitLibState, UnitPluginState } from '@dsh-workbench/shared/host';
import type { UnitLibState } from '@dsh-workbench/shared/host';
import type { UnitLibNeed } from '@dsh-workbench/shared/host';


export function installedLibVersion(name: string): string | undefined {
  try {
    const parsed = JSON.parse(
      readFileSync(join(libDir(name), 'package.json'), 'utf8'),
    ) as { version?: unknown };
    const version = parsed.version;
    return typeof version === 'string' && version.trim() !== ''
      ? version.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function probeLibs(options: {
  readonly needs: readonly UnitLibNeed[];
  readonly shell: DshShell;
  readonly force: boolean;
}): Promise<ReadonlyMap<string, UnitLibState>> {
  const { needs, shell, force } = options;
  const found = new Map<string, UnitLibState>();
  for (const need of needs) {
    if (found.has(need.name)) continue;
    const base = { name: need.name, purpose: need.purpose };
    const installed = installedLibVersion(need.name);
    if (installed === undefined) {
      found.set(need.name, {
        ...base,
        status: 'missing',
        command: libInstallCommand({ need }),
      });
      continue;
    }
    if (checkVersionRange(need.version, installed) !== 'satisfied') {
      found.set(need.name, {
        ...base,
        status: 'unsatisfied',
        installed,
        command: libInstallCommand({ need }),
      });
      continue;
    }
    const registry = process.env[need.registryEnv]?.trim() || need.registryDefault;
    const latest = await latestVersion({ shell, name: need.name, registry, force });
    const behind = latest !== undefined && isNewerVersion(latest, installed);
    found.set(need.name, {
      ...base,
      status: behind ? 'outdated' : 'ok',
      installed,
      ...(latest === undefined ? {} : { latest }),
      ...(behind
        ? { command: libInstallCommand({ need, version: latest }) }
        : {}),
    });
  }
  return found;
}




export function resetLibCache(): void {
  resetReleaseCache();
}
