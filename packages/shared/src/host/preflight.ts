export type PreflightStepId = 'toolchain' | 'opencli' | 'bridge' | 'diy' | 'warm';
export type PreflightStepStatus = 'pending' | 'running' | 'ok' | 'warn' | 'failed';
export type PreflightFailure = 'permission' | 'network' | 'missing' | 'unknown';
export type PreflightGuidance = 'install' | 'path' | 'shell';
export type PreflightBridgeIssue = 'daemon' | 'extension' | 'profile' | 'stale' | 'unknown';

export interface PreflightStep {
  readonly id: PreflightStepId;
  readonly status: PreflightStepStatus;
  readonly detail?: string;
  readonly action?: string;
  readonly command?: string;
}

export interface PreflightDiyGap {
  readonly rows: readonly string[];
  readonly detail: string;
  readonly command: string;
}

export interface PreflightSnapshot {
  readonly phase: 'idle' | 'checking' | 'installing' | 'ready' | 'failed';
  readonly steps: readonly PreflightStep[];
  readonly at: number;
  readonly error?: string;
  readonly failure?: PreflightFailure;
  readonly guidance?: PreflightGuidance;
  readonly bridgeIssues?: readonly PreflightBridgeIssue[];
  readonly diyGap?: PreflightDiyGap;
  readonly canWakeBrowser?: boolean;
}
