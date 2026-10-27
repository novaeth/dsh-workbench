import { describe, expect, it } from 'vitest';
import { clientSurface } from '../client';

describe('客户端平台面', () => {
  it('★ 没有 dshDesktop 就是浏览器，调试 footer 可用', () => {
    const surface = clientSurface({ win: {}, platform: 'darwin' });
    expect(surface.deployment).toBe('web');
    expect(surface.shell).toBe('browser');
    expect(surface.hostOs).toBe('darwin');
    expect(surface.capabilities.debugFooter).toBe(true);
  });

  it('★ 有 dshDesktop 就是 Electron，调试 footer 关闭', () => {
    const surface = clientSurface({
      win: { dshDesktop: { protocolVersion: 1 } },
      platform: 'win32',
    });
    expect(surface.deployment).toBe('desktop');
    expect(surface.shell).toBe('electron');
    expect(surface.hostOs).toBe('win32');
    expect(surface.capabilities.debugFooter).toBe(false);
  });

  it('未知平台不假装成 linux', () => {
    expect(clientSurface({ win: {}, platform: 'freebsd' }).hostOs).toBe('other');
  });
});
