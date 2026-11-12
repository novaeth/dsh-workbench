import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { DshHostContext } from '@dsh-workbench/shared/host';
import type { AdapterSet } from '@dsh-workbench/shared/host';

function corePackageRoot(): string | undefined {
  try {
    return dirname(createRequire(import.meta.url).resolve('@dsh-workbench/core/package.json'));
  } catch {
    return undefined;
  }
}

export function browserExtensionDir(root: string | undefined = corePackageRoot()): string | undefined {
  if (root === undefined) return undefined;
  const dir = join(root, 'vendor', 'browser-extension');
  return existsSync(join(dir, 'manifest.json')) ? dir : undefined;
}

export function shippedAdapterSetSpec(moduleUrl: string): string {
  const read = JSON.parse(readFileSync(new URL('../../package.json', moduleUrl), 'utf8')) as {
    readonly workbench?: { readonly adapterSet?: unknown };
  };
  const spec = read.workbench?.adapterSet;
  if (typeof spec !== 'string' || spec.trim() === '')
    throw new Error('package.json 没写 workbench.adapterSet：外壳不知道该装哪份适配器集合');
  return spec.trim();
}

export async function shippedAdapterSet(ctx: DshHostContext): Promise<AdapterSet> {
  const spec = shippedAdapterSetSpec(import.meta.url);
  const mod = (await import(spec)) as {
    readonly createAdapterSet?: (context: DshHostContext) => AdapterSet | Promise<AdapterSet>;
  };
  const factory = mod.createAdapterSet;
  if (typeof factory !== 'function') throw new Error(`随包的适配器集合 ${spec} 没导出 createAdapterSet(ctx)`);
  return await factory(ctx);
}
