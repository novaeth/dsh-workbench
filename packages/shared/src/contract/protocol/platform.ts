export type Deployment = 'web' | 'desktop';

export type HostOs = 'darwin' | 'win32' | 'linux' | 'other';

export type HostRuntime = 'electron' | 'node';

export type ClientShell = 'electron' | 'browser';

export type ProfileName = 'desktop' | 'web' | 'workbench' | 'headless' | 'other';

export type SelfUpdateCli = 'path-dsh' | 'desktop-cli';

export interface HostCapabilities {
  readonly pageDebug: boolean;
  readonly siteExplore: boolean;
  readonly recording: boolean;
  readonly browserWake: boolean;
  readonly selfUpdateCli: SelfUpdateCli;
  readonly safeMode: boolean;
}

export interface ToolchainPlan {
  readonly node: { readonly source: 'desktop-shim' | 'path' };
  readonly npm: { readonly neededFor: 'runtime-install' };
  readonly pnpm: { readonly neededFor: 'workshop'; readonly expectedMajor: 10 };
}

export interface HostSurface {
  readonly deployment: Deployment;
  readonly hostOs: HostOs;
  readonly runtime: HostRuntime;
  readonly profile: ProfileName;
  readonly capabilities: HostCapabilities;
  readonly restartHint: string;
  readonly toolchain: ToolchainPlan;
}

export interface ClientCapabilities {
  readonly debugFooter: boolean;
}

export interface ClientSurface {
  readonly deployment: Deployment;
  readonly shell: ClientShell;
  readonly hostOs: HostOs;
  readonly capabilities: ClientCapabilities;
}
