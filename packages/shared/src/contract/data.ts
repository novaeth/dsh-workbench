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
  readonly adapter: string;
  readonly argv: readonly string[];
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
  readonly pageCode?: string;
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

export interface CredentialSourceCookie {
  readonly kind: 'cookie';
}

export interface CredentialSourceCookieValue {
  readonly kind: 'cookieValue';
  readonly name: string;
}

export interface CredentialSourceEndpoint {
  readonly kind: 'endpoint';
  readonly url: string;
  readonly method?: 'GET' | 'POST';
  readonly body?: unknown;
  readonly path: string;
}

export interface CredentialSourceMeta {
  readonly kind: 'meta';
  readonly name: string;
}

export interface CredentialSourceGlobal {
  readonly kind: 'global';
  readonly path: string;
}

export interface CredentialSourceStorage {
  readonly kind: 'storage';
  readonly area: 'local' | 'session';
  readonly key: string;
  readonly path?: string;
}

export type CredentialSource =
  | CredentialSourceCookie
  | CredentialSourceCookieValue
  | CredentialSourceEndpoint
  | CredentialSourceMeta
  | CredentialSourceGlobal
  | CredentialSourceStorage;

export type CredentialPlace =
  | { readonly in: 'cookie' }
  | { readonly in: 'header'; readonly name: string; readonly prefix?: string }
  | { readonly in: 'query'; readonly name: string }
  | { readonly in: 'body'; readonly field: string };

export type RecipeAuth =
  | { readonly kind: 'none' }
  | { readonly kind?: undefined; readonly source: CredentialSource; readonly place: CredentialPlace };

export interface RecipeRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly contentType?: 'json' | 'form';
}

export interface RecipeResponse {
  readonly kind: 'json' | 'text';
  readonly path?: string;
  readonly maxBytes?: number;
}

export interface RequestRecipe {
  readonly origin: string;
  readonly loginUrl?: string;
  readonly session?: string;
  readonly timeoutMs?: number;
  readonly auth?: RecipeAuth;
  readonly request: RecipeRequest;
  readonly response?: RecipeResponse;
}

export interface CallOverrides {
  readonly path?: string;
  readonly query?: Readonly<Record<string, string | number | boolean>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly response?: Partial<RecipeResponse>;
}

export type RecipeCalls = Readonly<Record<string, CallOverrides>>;

export type RecipeResults<T = unknown> = Readonly<Record<string, DataResult<T>>>;

export interface DataReader {
  read<T = unknown>(request: DataRequest): Promise<DataResult<T>>;
  request<T = unknown>(recipe: RequestRecipe, overrides?: CallOverrides): Promise<DataResult<T>>;
  requestMany<T = unknown>(recipe: RequestRecipe, calls: RecipeCalls): Promise<RecipeResults<T>>;
  submit<T = unknown>(recipe: RequestRecipe, overrides?: CallOverrides): Promise<DataResult<T>>;
}
