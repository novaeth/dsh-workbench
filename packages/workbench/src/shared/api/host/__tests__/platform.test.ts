import { describe, expect, it } from 'vitest';
import { hostOsOf, hostSurface, profileNameOf } from '../platform';

describe('profile 与宿主 OS 归一', () => {
  it('profile 名大小写不敏感，认路径；不认识的保留为 other', () => {
    expect(profileNameOf('/home/me/.dsh/profiles/Desktop')).toBe('desktop');
    expect(profileNameOf('workbench')).toBe('workbench');
    expect(profileNameOf('my-profile')).toBe('other');
    expect(profileNameOf(undefined)).toBe('other');
  });

  it('未知 OS 不假装成 linux', () => {
    expect(hostOsOf('darwin')).toBe('darwin');
    expect(hostOsOf('freebsd')).toBe('other');
  });
});

describe('宿主平台面', () => {
  it('★ Desktop 的能力与工具链：屏调试关，站点/录制留，Node 走 shim', () => {
    const surface = hostSurface({
      proc: { versions: { electron: '44.7.0', node: '24.15.0' } },
      profile: 'desktop',
      platform: 'darwin',
    });
    expect(surface.deployment).toBe('desktop');
    expect(surface.runtime).toBe('electron');
    expect(surface.hostOs).toBe('darwin');
    expect(surface.profile).toBe('desktop');
    expect(surface.capabilities.pageDebug).toBe(false);
    expect(surface.capabilities.siteExplore).toBe(true);
    expect(surface.capabilities.recording).toBe(true);
    expect(surface.capabilities.browserWake).toBe(true);
    expect(surface.capabilities.selfUpdateCli).toBe('desktop-cli');
    expect(surface.capabilities.safeMode).toBe(true);
    expect(surface.restartHint).toBe('退出并重开 Desktop');
    expect(surface.toolchain.node.source).toBe('desktop-shim');
  });

  it('★ web 不被 Desktop 的策略影响：屏调试开，CLI 走 PATH', () => {
    const surface = hostSurface({
      proc: { versions: { node: '24.15.0' } },
      profile: 'web',
      platform: 'win32',
    });
    expect(surface.deployment).toBe('web');
    expect(surface.runtime).toBe('node');
    expect(surface.hostOs).toBe('win32');
    expect(surface.capabilities.pageDebug).toBe(true);
    expect(surface.capabilities.browserWake).toBe(false);
    expect(surface.capabilities.selfUpdateCli).toBe('path-dsh');
    expect(surface.capabilities.safeMode).toBe(false);
    expect(surface.restartHint).toBe('重启一次 dsh');
    expect(surface.toolchain.node.source).toBe('path');
  });

  it('Desktop 但非 desktop profile：能力仍按部署，CLI 按 profile', () => {
    const surface = hostSurface({
      proc: { versions: { electron: '44.7.0' } },
      profile: 'workbench',
      platform: 'linux',
    });
    expect(surface.deployment).toBe('desktop');
    expect(surface.capabilities.pageDebug).toBe(false);
    expect(surface.capabilities.selfUpdateCli).toBe('path-dsh');
  });

  it('Desktop × Windows：可以尝试浏览器唤醒（真机另验）', () => {
    const surface = hostSurface({
      proc: { versions: { electron: '44.7.0' } },
      profile: 'desktop',
      platform: 'win32',
    });
    expect(surface.capabilities.browserWake).toBe(true);
  });
});
