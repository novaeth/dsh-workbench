import { existsSync } from 'node:fs';
import { isolatedInstallCommand, isolatedPnpmInstallCommand } from '@dsh-workbench/adapter-runtime';
import { desktopPnpmPath, type PnpmProcess } from './toolchain.js';

export function opencliInstallCommand(
  proc: PnpmProcess = process,
  exists: (path: string) => boolean = existsSync,
): string {
  const pnpm = desktopPnpmPath(proc, exists);
  return pnpm === undefined ? isolatedInstallCommand() : isolatedPnpmInstallCommand(pnpm);
}
