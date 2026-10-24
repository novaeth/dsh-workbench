export interface DataRequestBase {
  readonly timeoutMs?: number;
}

export interface HttpDataRequest extends DataRequestBase {
  readonly kind: 'http';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface BrowserDataRequest extends DataRequestBase {
  readonly kind: 'browser';
  readonly script: string;
  readonly url?: string;
  readonly loginUrl?: string;
  readonly session?: string;
  readonly open?: boolean;
}

export interface CommandDataRequest extends DataRequestBase {
  readonly kind: 'command';
  readonly command: string;
}

export type DataRequest = HttpDataRequest | BrowserDataRequest | CommandDataRequest;

export type DataErrorCode = 'invalid-request' | 'http' | 'auth' | 'timeout' | 'parse' | 'command' | 'browser';

export interface DataError {
  readonly code: DataErrorCode;
  readonly message: string;
  readonly status?: number;
  readonly detail?: string;
  readonly hint?: string;
  readonly helpUrl?: string;
}

export interface DataSuccess<T = unknown> {
  readonly ok: true;
  readonly data: T;
}

export interface DataFailure {
  readonly ok: false;
  readonly error: DataError;
}

export type DataResult<T = unknown> = DataSuccess<T> | DataFailure;

export interface DataReader {
  read<T = unknown>(request: DataRequest): Promise<DataResult<T>>;
}
