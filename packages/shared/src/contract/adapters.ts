export interface BrowserPort {
  read(input: unknown): Promise<unknown>;
  find(input: unknown): Promise<unknown>;
}

export interface PreflightPort {
  run(options?: { readonly hard?: boolean }): Promise<unknown>;
  snapshot(): unknown;
}
