import type { HostOs, HostSurface, ProfileName, SelfUpdateCli } from '../contract/protocol/platform.js';

export interface HostSurfaceInput {
  readonly proc?: { readonly versions: { readonly electron?: string | undefined; readonly node?: string | undefined } };
  readonly profile?: string | undefined;
  readonly platform?: NodeJS.Platform | undefined;
}

export function profileNameOf(raw: string | undefined): ProfileName {
  const name = (raw ?? '').split(/[\\/]/).pop()?.toLowerCase() ?? '';
  if (name === 'desktop' || name === 'web' || name === 'workbench' || name === 'headless') return name;
  return 'other';
}

export function hostOsOf(platform: NodeJS.Platform): HostOs {
  if (platform === 'darwin' || platform === 'win32' || platform === 'linux') return platform;
  return 'other';
}

export function hostSurface(input: HostSurfaceInput = {}): HostSurface {
  const proc = input.proc ?? process;
  const runtime = proc.versions.electron === undefined ? 'node' : 'electron';
  const deployment = runtime === 'electron' ? 'desktop' : 'web';
  const profile = profileNameOf(input.profile);
  const hostOs = hostOsOf(input.platform ?? process.platform);
  const pageDebug = deployment !== 'desktop';
  const selfUpdateCli: SelfUpdateCli = profile === 'desktop' ? 'desktop-cli' : 'path-dsh';
  return {
    deployment,
    hostOs,
    runtime,
    profile,
    capabilities: {
      pageDebug,
      siteExplore: true,
      recording: true,
      browserWake: deployment === 'desktop',
      selfUpdateCli,
      safeMode: deployment === 'desktop',
    },
    restartHint: deployment === 'desktop' ? '退出并重开 Desktop' : '重启一次 dsh',
    toolchain: {
      node: { source: deployment === 'desktop' ? 'desktop-shim' : 'path' },
      npm: { neededFor: 'runtime-install' },
      pnpm: { neededFor: 'workshop', expectedMajor: 10 },
    },
  };
}
