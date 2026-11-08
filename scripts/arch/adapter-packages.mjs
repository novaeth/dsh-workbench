import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export const ADAPTER_IMPL_PACKAGES = ['adapter-runtime', 'adapter-supply', 'adapter-profile', 'adapter-probe'];

export const ADAPTER_CONTRACT_SETS = [
  { name: '@dsh-workbench/adapters-default', surface: 'required', cliDirs: 'required' },
  { name: '@dsh-workbench/adapters-chrome-mcp', surface: 'absent', cliDirs: 'absent' },
];

export const ADAPTER_ALLOWED_IMPORTS =
  /^(node:|@dsh-workbench\/(shared|adapter-[a-z-]+)|execa$|proper-lockfile$|write-file-atomic$|dayjs$)/;

export function adapterPackageDirs() {
  return readdirSync(join(ROOT, 'packages'))
    .filter((name) => name.startsWith('adapter-') || name.startsWith('adapters-'))
    .map((name) => `packages/${name}`)
    .sort();
}
