import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { opencliInstallCommand } from '../install.js';
import { desktopPnpmPath } from '../toolchain.js';

const resources =
  process.platform === 'win32'
    ? 'C:\\Applications\\Test.app\\Contents\\Resources'
    : '/Applications/Test.app/Contents/Resources';
const pnpm = join(resources, 'runtime', 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.cjs');
const desktop = { versions: { electron: '44.7.0', node: '24.15.0' }, resourcesPath: resources };

describe('Desktop opencli 安装命令', () => {
  it('★ Desktop 有 bundled pnpm → 走 pnpm，不再要求 npm', () => {
    const command = opencliInstallCommand(desktop, (path) => path === pnpm);

    expect(command).toContain(pnpm);
    expect(command).toContain('add --dir');
    expect(command).toContain('--allow-build=@jackwener/opencli');
    expect(command).not.toContain('npm i --prefix');
  });

  it('web 继续走 npm', () => {
    const command = opencliInstallCommand({ versions: { node: '24.15.0' } }, () => true);

    expect(command).toContain('npm i --prefix');
    expect(command).not.toContain('pnpm.cjs');
  });

  it('Desktop 但 bundled pnpm 不在 → 回退 npm 命令', () => {
    const command = opencliInstallCommand(desktop, () => false);

    expect(command).toContain('npm i --prefix');
    expect(desktopPnpmPath(desktop, () => false)).toBeUndefined();
  });
});
