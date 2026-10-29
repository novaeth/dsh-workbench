import type { DshShell } from '../api/dsh.js';
import { runShell } from './shell.js';
import { quoteShellArg } from './shell-text.js';
import { parseJsonLoose } from '../lib/text.js';
import { VERSION_CHECK_TIMEOUT_MS, VERSION_CHECK_TTL_MS } from '../config/constants.js';

function recordOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : undefined;
}

export interface RegistryDshLookup {
  readonly readable: boolean;
  readonly raw: unknown;
}

export interface RegistryLookup {
  registryDshOf(options: RegistryDshOptions): Promise<RegistryDshLookup>;
  registryDeclarationOf(options: RegistryDeclarationOptions): Promise<unknown | undefined>;
}

interface RegistryDshOptions {
  readonly shell: DshShell;
  readonly name: string;
  readonly registry?: string | undefined;
  readonly force?: boolean;
  readonly cacheDir?: string | undefined;
}

interface RegistryDeclarationOptions extends RegistryDshOptions {
  readonly registry: string;
}

export function createRegistryLookup(): RegistryLookup {
  const cache = new Map<string, { at: number; raw: unknown }>();
  return {
    registryDshOf: (options) => dshOf(cache, options),
    registryDeclarationOf: async (options) => {
      const found = await dshOf(cache, options);
      return found.readable ? recordOf(found.raw)?.workbench : undefined;
    },
  };
}

async function dshOf(cache: Map<string, { at: number; raw: unknown }>, options: {
  shell: DshShell;
  name: string;
  registry?: string | undefined;
  force?: boolean;
  cacheDir?: string | undefined;
}): Promise<RegistryDshLookup> {
  const { shell, name, registry, force = false, cacheDir } = options;
  const key = `${registry ?? ''}|${name}`;
  const hit = cache.get(key);
  if (!force && hit !== undefined && Date.now() - hit.at < VERSION_CHECK_TTL_MS) {
    return { readable: true, raw: hit.raw };
  }

  const at = registry === undefined ? '' : ` --registry ${quoteShellArg(registry)}`;
  const cached = cacheDir === undefined ? '' : ` --cache ${quoteShellArg(cacheDir)}`;
  const result = await runShell(
    shell,
    `npm view ${quoteShellArg(name)} dsh --json${at}${cached}`,
    { timeoutMs: VERSION_CHECK_TIMEOUT_MS },
  ).catch(() => undefined);
  const parsed = result?.exitCode === 0 ? parseJsonLoose(result.stdout) : undefined;
  if (parsed === undefined) return { readable: false, raw: undefined };
  cache.set(key, { at: Date.now(), raw: parsed });
  return { readable: true, raw: parsed };
}

