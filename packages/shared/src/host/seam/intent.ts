/**
 * 执行缝的语义写入域：调用点只声明自己写哪一类树，不传裸根。
 * 策略合成、环境注入与拒绝处置都住在执行缝模块里。
 */
export type SeamMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface ProductWriteIntent {
  readonly kind: 'product';
}

export interface WorkspaceWriteIntent {
  readonly kind: 'workspace';
}

export interface PathsWriteIntent {
  readonly kind: 'paths';
  readonly paths: readonly string[];
}

export interface NoWriteIntent {
  readonly kind: 'none';
}

export type WriteIntent = ProductWriteIntent | WorkspaceWriteIntent | PathsWriteIntent | NoWriteIntent;

export type DenialScope = 'product' | 'workspace' | 'external' | 'unknown';

export interface SeamPolicy {
  readonly mode: SeamMode;
  readonly workspaceRoot: string;
}

export interface SeamDenial {
  readonly path?: string | undefined;
  readonly scope: DenialScope;
  readonly healed?: boolean | undefined;
}

export interface SeamFact {
  readonly at: number;
  readonly verb: 'run' | 'spawn' | 'open';
  readonly command: string;
  readonly intent: WriteIntent['kind'] | 'host';
  readonly mode: SeamMode | 'host';
  readonly workspaceRoot: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly stalled: boolean;
  readonly denial?: SeamDenial | undefined;
}

export type SeamErrorCode =
  | 'workspace-unknown'
  | 'read-only'
  | 'paths-span-trees'
  | 'scope-not-declared'
  | 'sandbox-denied'
  | 'sandbox-unavailable';

export class SeamError extends Error {
  readonly code: SeamErrorCode;
  readonly path?: string | undefined;
  readonly scope?: DenialScope | undefined;

  constructor(code: SeamErrorCode, message: string, extra: { readonly path?: string | undefined; readonly scope?: DenialScope | undefined } = {}) {
    super(message);
    this.name = 'SeamError';
    this.code = code;
    this.path = extra.path;
    this.scope = extra.scope;
  }
}

export type UnitWriteScope = 'unit' | 'workspace';

export interface UnitSeamRequest {
  readonly command: string;
  readonly scope: UnitWriteScope;
  readonly workdir?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly env?: Readonly<Record<string, string>> | undefined;
  readonly session?: unknown;
  readonly signal?: AbortSignal | undefined;
  readonly retry?: 'safe' | 'never' | undefined;
}

export function productWrite(): WriteIntent {
  return { kind: 'product' };
}

export function workspaceWrite(): WriteIntent {
  return { kind: 'workspace' };
}

export function pathsWrite(paths: readonly string[]): WriteIntent {
  return { kind: 'paths', paths };
}

export function noWrite(): WriteIntent {
  return { kind: 'none' };
}
