export type ExtensionSession = 'persistent' | 'ephemeral' | 'none';

export interface ExtensionCallOptions {
  readonly key?: string;
  readonly workdir?: string;
  readonly session?: ExtensionSession;
  readonly timeoutMs?: number;
}

export interface ExtensionValue<T = unknown> {
  readonly value: T;
  readonly at: number;
}

export interface ExtensionCaller {
  json(
    args: readonly string[],
    options?: ExtensionCallOptions,
  ): Promise<ExtensionValue>;
}
