import { describe, expect, it } from 'vitest';
import { clientSurface } from '../client';

describe('客户端平台面', () => {
  it('★ 没有 dshDesktop 就是浏览器，调试 footer 可用', () => {
    const surface = clientSurface({ win: {}, platform: 'darwin' });
    expect(surface.deployment).toBe('web');
    expect(surface.shell).toBe('browser');
    expect(surface.hostOs).toBe('darwin');
    expect(surface.capabilities.debugFooter).toBe(true);
    expect(surface.capabilities.macFileManager).toBe(true);
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
    expect(surface.capabilities.macFileManager).toBe(false);
  });

  it('页面没写 data-platform 时按 UA 认系统（浏览器里的 macOS 也算 darwin）', () => {
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    try {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' },
        configurable: true,
      });
      Object.defineProperty(globalThis, 'document', {
        value: { documentElement: { getAttribute: () => null } },
        configurable: true,
      });
      expect(clientSurface({ win: {} }).capabilities.macFileManager).toBe(true);
      Object.defineProperty(globalThis, 'document', {
        value: { documentElement: { getAttribute: () => 'linux' } },
        configurable: true,
      });
      expect(clientSurface({ win: {} }).capabilities.macFileManager).toBe(false);
    } finally {
      if (navigatorDescriptor !== undefined) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
      if (documentDescriptor !== undefined) Object.defineProperty(globalThis, 'document', documentDescriptor);
      else delete (globalThis as { document?: unknown }).document;
    }
  });

  it('未知平台不假装成 linux', () => {
    const surface = clientSurface({ win: {}, platform: 'freebsd' });
    expect(surface.hostOs).toBe('other');
    expect(surface.capabilities.macFileManager).toBe(false);
  });
});
