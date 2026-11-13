import { existsSync } from 'node:fs';
import { isolatedInstallCommand, isolatedPnpmInstallCommand, storeDirFor, toolchainDir } from '@dsh-workbench/adapter-runtime';
import { desktopPnpmPath, desktopPnpmVersion, type PnpmProcess } from './toolchain.js';

export function opencliInstallCommand(
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
  dir: string = toolchainDir(),
  store: string = storeDirFor(dir),
): string {
  const override = process.env.DSH_WB_PNPM?.trim();
  if (override !== undefined && override !== '') return isolatedInstallCommand(dir, store);
  const pnpm = desktopPnpmPath(proc, exists);
  const major = Number(desktopPnpmVersion(proc, exists)?.split('.')[0] ?? '0');
  return pnpm === undefined || (major !== 0 && major < 10)
    ? isolatedInstallCommand(dir, store)
    : isolatedPnpmInstallCommand(pnpm, dir, store);
}
