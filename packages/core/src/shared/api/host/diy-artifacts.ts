import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { workbenchRoot } from '@dsh-workbench/shared/host';

export function artifactsDirOf(root: string): string {
  const name = basename(root).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
  const hash = createHash('sha1').update(root).digest('hex').slice(0, 8);
  return join(workbenchRoot(), 'artifacts', `${name}-${hash}`);
}

export function ensureDirOf(dir: string): void {
  mkdirSync(dir, { recursive: true });
}
