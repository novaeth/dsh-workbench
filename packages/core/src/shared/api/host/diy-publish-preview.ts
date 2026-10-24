import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { modulesIn } from './diy-modules';

export interface PublishPreview {
  readonly name: string;
  readonly version: string;
  readonly registry?: string;
}

export function publishPreviewOf(root: string | null | undefined, unit: string): PublishPreview | null {
  if (root === null || root === undefined || unit === '') return null;
  const found = modulesIn(root).find((one) => one.unit === unit);
  if (found === undefined) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(join(found.dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
  if (typeof manifest !== 'object' || manifest === null) return null;
  const record = manifest as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'] : '';
  const version = typeof record['version'] === 'string' ? record['version'] : '';
  if (name === '' || version === '') return null;
  const publishConfig = record['publishConfig'];
  const registry =
    typeof publishConfig === 'object' && publishConfig !== null
      ? (publishConfig as Record<string, unknown>)['registry']
      : undefined;
  return {
    name,
    version,
    ...(typeof registry === 'string' && registry !== '' ? { registry } : {}),
  };
}
