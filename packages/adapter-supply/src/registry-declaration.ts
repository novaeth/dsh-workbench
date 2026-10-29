import { npmCacheDir } from '@dsh-workbench/adapter-runtime';
import type { DshShell } from '@dsh-workbench/shared';
import {
  parseJsonLoose,
  quoteShellArg,
  runShell,
  VERSION_CHECK_TIMEOUT_MS,
  VERSION_CHECK_TTL_MS,
} from '@dsh-workbench/shared/host';
import {
  declarationRefusalOf,
  dshRecordOf,
  localDirOf,
  packageManifestOf,
  packageNameOf,
  pathDeclarationOf,
} from '@dsh-workbench/shared/host';

export { declarationRefusalOf, dshRecordOf, localDirOf, packageManifestOf, packageNameOf, pathDeclarationOf };

const cache = new Map<string, { at: number; raw: unknown }>();

export interface RegistryDshLookup {
  readonly readable: boolean;
  readonly raw: unknown;
}

export async function registryDshOf(options: {
  shell: DshShell;
  name: string;
  registry?: string | undefined;
  force?: boolean;
}): Promise<RegistryDshLookup> {
  const { shell, name, registry, force = false } = options;
  const key = `${registry ?? ''}|${name}`;
  const hit = cache.get(key);
  if (!force && hit !== undefined && Date.now() - hit.at < VERSION_CHECK_TTL_MS) {
    return { readable: true, raw: hit.raw };
  }

  const at = registry === undefined ? '' : ` --registry ${quoteShellArg(registry)}`;
  const result = await runShell(
    shell,
    `npm view ${quoteShellArg(name)} dsh --json${at} --cache ${quoteShellArg(npmCacheDir())}`,
    { timeoutMs: VERSION_CHECK_TIMEOUT_MS },
  ).catch(() => undefined);
  const parsed = result?.exitCode === 0 ? parseJsonLoose(result.stdout) : undefined;
  if (parsed === undefined) return { readable: false, raw: undefined };
  cache.set(key, { at: Date.now(), raw: parsed });
  return { readable: true, raw: parsed };
}

export async function registryDeclarationOf(options: {
  shell: DshShell;
  name: string;
  registry: string;
  force?: boolean;
}): Promise<unknown | undefined> {
  const found = await registryDshOf(options);
  return found.readable ? recordOf(found.raw)?.workbench : undefined;
}

function recordOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}
