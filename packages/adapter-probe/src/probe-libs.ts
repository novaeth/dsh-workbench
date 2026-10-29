import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DshShell } from '@dsh-workbench/shared';
import type { LibNeed, NeedState, SupplyIndex } from '@dsh-workbench/shared/host';
import { libInstallCommand } from '@dsh-workbench/adapter-runtime';
import { needIdOf, npmSourceOf } from '@dsh-workbench/shared/host';
import { libDir } from '@dsh-workbench/adapter-runtime';
import { npmRegistryOf } from '@dsh-workbench/adapter-supply';
import { isNewerVersion, latestVersion, resetReleaseCache } from '@dsh-workbench/adapter-profile';
import { checkVersionRange } from './version-range.js';

export function installedLibVersion(name: string): string | undefined {
  try {
    const parsed = JSON.parse(readFileSync(join(libDir(name), 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    const version = parsed.version;
    return typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined;
  } catch {
    return undefined;
  }
}

function stateOf(need: LibNeed, status: NeedState['status'], detail: string, extra: Partial<NeedState> = {}): NeedState {
  return {
    id: needIdOf(need),
    kind: 'lib',
    name: need.name,
    status,
    detail,
    ...extra,
  };
}

export async function probeLibs(options: {
  readonly needs: readonly LibNeed[];
  readonly shell: DshShell;
  readonly force: boolean;
  readonly index?: SupplyIndex | undefined;
}): Promise<ReadonlyMap<string, NeedState>> {
  const { needs, shell, force, index } = options;
  const found = new Map<string, NeedState>();
  for (const need of needs) {
    if (found.has(need.name)) continue;
    const source = npmSourceOf(index?.sourcesOf('lib', need.name) ?? need.sources);
    const install =
      source === undefined
        ? {}
        : { command: libInstallCommand({ need, source, ...(need.version === undefined ? {} : { version: need.version }) }) };
    const installed = installedLibVersion(need.name);
    if (installed === undefined) {
      found.set(need.name, stateOf(need, 'missing', `共用依赖 ${need.name} 没装`, install));
      continue;
    }
    if (checkVersionRange(need.version, installed) !== 'satisfied') {
      found.set(
        need.name,
        stateOf(need, 'unsatisfied', `装的是 ${installed}，声明要 ${need.version ?? '任意版本'}`, {
          installed,
          ...install,
        }),
      );
      continue;
    }
    const registry = source === undefined ? undefined : npmRegistryOf(source, process.env);
    const latest =
      registry === undefined || !registry.ok
        ? undefined
        : await latestVersion({ shell, name: need.name, registry: registry.value, force });
    const behind = latest !== undefined && isNewerVersion(latest, installed);
    found.set(
      need.name,
      stateOf(need, behind ? 'outdated' : 'ok', behind ? `装的 ${installed}，源上最新 ${latest ?? ''}` : `${installed} 版本对`, {
        installed,
        ...(latest === undefined ? {} : { latest }),
        ...(behind && source !== undefined
          ? { command: libInstallCommand({ need, source, version: latest }) }
          : {}),
      }),
    );
  }
  return found;
}

export function resetLibCache(): void {
  resetReleaseCache();
}
