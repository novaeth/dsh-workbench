import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPENCLI_NPM_PACKAGE, runtimeLayoutOf } from '@dsh-workbench/shared/host';

export const OPENCLI_RUNTIME_ID = 'opencli';
export const OPENCLI_MANIFEST_FILE = 'opencli-plugin.json';
export { OPENCLI_NPM_PACKAGE };

const layout = (): ReturnType<typeof runtimeLayoutOf> => runtimeLayoutOf(OPENCLI_RUNTIME_ID);

export function isolatedRoot(): string {
  return layout().root;
}

export function isolatedHome(): string {
  return layout().home;
}

export function vendorPrefix(): string {
  return layout().vendorPrefix;
}

export function vendorPluginsDir(): string {
  return layout().vendorPluginsDir;
}

export function libsPrefix(): string {
  return layout().libsPrefix;
}

export function libsBinDir(): string {
  return layout().libsBinDir;
}

export function npmCacheDir(): string {
  return layout().npmCacheDir;
}

export function pnpmStoreDir(): string {
  return layout().pnpmStoreDir;
}

function readTextFile(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function unquote(value: string): string {
  const first = value.at(0);
  const last = value.at(-1);
  const paired = value.length >= 2 && (first === '"' || first === "'") && last === first;
  return paired ? value.slice(1, -1).trim() : value;
}

function jsonStoreDir(text: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    const value = (parsed as Record<string, unknown>)['storeDir'];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

function lineStoreDir(text: string): string | undefined {
  const line = text.split(/\r?\n/u).find((entry) => entry.startsWith('storeDir:'));
  if (line === undefined) return undefined;
  const value = unquote(line.slice('storeDir:'.length).trim());
  return value === '' ? undefined : value;
}

export function storeDirFor(
  projectDir: string,
  read: (file: string) => string | undefined = readTextFile,
): string {
  const text = read(join(projectDir, 'node_modules', '.modules.yaml'));
  if (text === undefined) return pnpmStoreDir();
  return jsonStoreDir(text) ?? lineStoreDir(text) ?? pnpmStoreDir();
}

export function toolchainOpencliDir(): string {
  return join(isolatedRoot(), 'toolchain', 'node_modules', ...OPENCLI_NPM_PACKAGE.split('/'));
}

export function vendorPeerLink(): { readonly dir: string; readonly parent: string } {
  const base = join(vendorPrefix(), 'node_modules');
  const [scope] = OPENCLI_NPM_PACKAGE.split('/');
  return { dir: join(base, ...OPENCLI_NPM_PACKAGE.split('/')), parent: join(base, scope ?? '') };
}
