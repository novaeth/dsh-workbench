export interface OverviewFile {
  readonly name: string;
  readonly bytes: number;
  readonly mtime: string;
}

export interface OverviewPayload {
  readonly path: string;
  readonly files: number;
  readonly dirs: number;
  readonly bytes: number;
  readonly largest: readonly OverviewFile[];
}

export type OverviewReady = { readonly ok: true } & OverviewPayload;

export interface Failure {
  readonly code: string;
  readonly message: string;
}

export type OverviewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly payload: OverviewPayload }
  | { readonly kind: 'empty'; readonly payload: OverviewPayload }
  | { readonly kind: 'error'; readonly detail: string };

export interface OverviewInput {
  readonly phase: 'idle' | 'loading' | 'ready' | 'error';
  readonly value: OverviewReady | undefined;
  readonly error: Failure | undefined;
}

export const LIST_LIMIT = 5;

const KB = 1024;

export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${String(bytes)} B`;
  if (bytes < KB * KB) return `${(bytes / KB).toFixed(1)} KB`;
  if (bytes < KB * KB * KB) return `${(bytes / (KB * KB)).toFixed(1)} MB`;
  return `${(bytes / (KB * KB * KB)).toFixed(1)} GB`;
}

function payloadState(payload: OverviewPayload): OverviewState {
  const blank = payload.files === 0 && payload.dirs === 0;
  return blank ? { kind: 'empty', payload } : { kind: 'ready', payload };
}

export function overviewStateOf(input: OverviewInput): OverviewState {
  if (input.phase === 'idle') return { kind: 'idle' };
  if (input.phase === 'error') {
    const error = input.error;
    return { kind: 'error', detail: error === undefined ? '' : `${error.code}: ${error.message}` };
  }
  if (input.value !== undefined && (input.phase === 'ready' || input.phase === 'loading')) {
    return payloadState(input.value);
  }
  return { kind: 'loading' };
}
