import { existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { OPENCLI_NPM_PACKAGE, libsPrefix, toolchainOpencliDir } from './paths.js';

/**
 * 让共用依赖也能 import opencli：把隔离运行时里那份 opencli 链接到 libs 的 node_modules。
 * 跑在 libs 里的命令（比如 opencli-workflow 带的 gitops）会按包名找 @jackwener/opencli，
 * 找不到就起不来 —— 它不在 libs 的依赖里，是运行时提供的那一份。
 * @returns 这次真的建了链接就 `true`；已经有了、或运行时那份还没装，就是 `false`。
 */
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
