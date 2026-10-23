import type { ClientSurface, HostOs } from './contract';

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

function defaultPlatform(): string {
  if (typeof document === 'undefined' || document.documentElement === undefined) return '';
  return document.documentElement.getAttribute('data-platform') ?? '';
}

export function clientSurface(input: ClientSurfaceInput = {}): ClientSurface {
  const win = input.win ?? defaultWindow();
  const shell = win?.dshDesktop === undefined ? 'browser' : 'electron';
  return {
    deployment: shell === 'electron' ? 'desktop' : 'web',
    shell,
    hostOs: clientHostOs(input.platform ?? defaultPlatform()),
    capabilities: { debugFooter: shell !== 'electron' },
  };
}
