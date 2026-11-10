import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { linkDir } from '@dsh-workbench/shared/host';
import { OPENCLI_NPM_PACKAGE, libsBinDir, libsPrefix, toolchainOpencliDir } from '../foundation/paths.js';


export function ensureLibsBinOnPath(env: NodeJS.ProcessEnv = process.env): boolean {
  const dir = libsBinDir();
  const parts = (env.PATH ?? '').split(delimiter).filter((one) => one !== '');
  if (parts.includes(dir)) return false;
  env.PATH = [dir, ...parts].join(delimiter);
  return true;
}

function pointsAt(link: string, target: string): boolean {
  try {
    return realpathSync(link) === realpathSync(target);
  } catch {
    return false;
  }
}

export function ensureLibsOpencliPeer(): boolean {
  const link = join(libsPrefix(), 'node_modules', ...OPENCLI_NPM_PACKAGE.split('/'));
  const target = toolchainOpencliDir();
  if (!existsSync(target)) return false;
  if (pointsAt(link, target)) return false;
  try {
    mkdirSync(dirname(link), { recursive: true });
    linkDir(target, link);
    return true;
  } catch {
    return false;
  }
}
