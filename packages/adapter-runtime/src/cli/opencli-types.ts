export interface OpencliResult {
  readonly value: unknown;
  readonly at: number;
}

export type OpencliSession = 'persistent' | 'ephemeral' | 'none';

export interface Opencli {
  json(
    args: readonly string[],
    options?: { key?: string; workdir?: string; session?: OpencliSession },
  ): Promise<OpencliResult>;
}
