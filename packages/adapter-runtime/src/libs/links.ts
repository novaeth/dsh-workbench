import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { delimiter, dirname } from 'node:path';
import { OPENCLI_NPM_PACKAGE, libsBinDir, libsPrefix, toolchainOpencliDir } from '../paths.js';


export function ensureLibsBinOnPath(env: NodeJS.ProcessEnv = process.env): boolean {
  const dir = libsBinDir();
  const parts = (env.PATH ?? '').split(delimiter).filter((one) => one !== '');
  if (parts.includes(dir)) return false;
  env.PATH = [dir, ...parts].join(delimiter);
  return true;
}

export function ensureLibsOpencliPeer(): boolean {
  const link = `${libsPrefix()}/node_modules/${OPENCLI_NPM_PACKAGE}`;
  if (existsSync(link)) return false;
  const target = toolchainOpencliDir();
  if (!existsSync(target)) return false;
  try {
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(target, link);
    return true;
  } catch {
    return false;
  }
}
