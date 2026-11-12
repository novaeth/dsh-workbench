import type { ClientSurface, HostOs } from '@/kernel/contract/platform';

export interface ClientSurfaceInput {
  readonly win?: { readonly dshDesktop?: { readonly protocolVersion?: number } } | undefined;
  readonly platform?: string | undefined;
}

function clientHostOs(platform: string): HostOs {
  const value = platform.toLowerCase();
  if (value === 'darwin' || value === 'win32' || value === 'linux') return value;
  return 'other';
}

function defaultWindow(): ClientSurfaceInput['win'] {
  if (typeof window === 'undefined') return undefined;
  return window as unknown as { readonly dshDesktop?: { readonly protocolVersion?: number } };
}

function platformOfUserAgent(userAgent: string): string {
  if (/Macintosh|Mac OS X/iu.test(userAgent)) return 'darwin';
  if (/Windows/iu.test(userAgent)) return 'win32';
  if (/Linux|X11/iu.test(userAgent)) return 'linux';
  return '';
}

function defaultPlatform(): string {
  if (typeof document === 'undefined' || document.documentElement === undefined) return '';
  const declared = document.documentElement.getAttribute('data-platform') ?? '';
  if (declared !== '') return declared;
  return typeof navigator === 'undefined' ? '' : platformOfUserAgent(navigator.userAgent);
}

export function clientSurface(input: ClientSurfaceInput = {}): ClientSurface {
  const win = input.win ?? defaultWindow();
  const shell = win?.dshDesktop === undefined ? 'browser' : 'electron';
  const hostOs = clientHostOs(input.platform ?? defaultPlatform());
  return {
    deployment: shell === 'electron' ? 'desktop' : 'web',
    shell,
    hostOs,
    capabilities: { debugFooter: shell !== 'electron', macFileManager: hostOs === 'darwin' },
  };
}
