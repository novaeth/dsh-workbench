import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { DshHomePath, DshHostContext } from '@dsh-workbench/shared';

export function artifactsDirOf(ctx: DshHostContext, root: string): string {
  const homePath = ctx.get<DshHomePath>('dshHomePath');
  if (typeof homePath !== 'function') {
    throw new Error('这台机器没有 dshHomePath 服务 —— 落不了截图与录制（取证目录由它给）');
  }
  const name = basename(root).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
  const hash = createHash('sha1').update(root).digest('hex').slice(0, 8);
  return homePath(join('workbench', 'artifacts', `${name}-${hash}`));
}

export function ensureDirOf(dir: string): void {
  mkdirSync(dir, { recursive: true });
}
