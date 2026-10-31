import { join } from 'node:path';
import { runtimeLayoutOf } from '@dsh-workbench/shared/host';

export const OPENCLI_RUNTIME_ID = 'opencli';
export const OPENCLI_MANIFEST_FILE = 'opencli-plugin.json';
export const OPENCLI_NPM_PACKAGE = '@jackwener/opencli';

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

export function toolchainOpencliDir(): string {
  return join(isolatedRoot(), 'toolchain', 'node_modules', ...OPENCLI_NPM_PACKAGE.split('/'));
}

export function vendorPeerLink(): { readonly dir: string; readonly parent: string } {
  const base = join(vendorPrefix(), 'node_modules');
  const [scope] = OPENCLI_NPM_PACKAGE.split('/');
  return { dir: join(base, ...OPENCLI_NPM_PACKAGE.split('/')), parent: join(base, scope ?? '') };
}
