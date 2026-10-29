interface OpencliResult {
  readonly value: unknown;
  readonly at: number;
}

interface Opencli {
  json(
    args: readonly string[],
    options?: { readonly key?: string; readonly workdir?: string; readonly session?: string; readonly refresh?: boolean },
  ): Promise<OpencliResult>;
}

export interface OpencliCall {
  args: readonly string[];
  key?: string;
  workdir?: string;
  session?: string;
  refresh?: boolean;
}

export function createFakeOpencli(
  replies: Array<unknown | Error> | ((call: OpencliCall, index: number) => unknown | Error) = [],
) {
  const calls: OpencliCall[] = [];
  const opencli: Opencli = {
    async json(args, options = {}) {
      const call: OpencliCall = {
        args,
        ...(options.key === undefined ? {} : { key: options.key }),
        ...(options.workdir === undefined ? {} : { workdir: options.workdir }),
        ...(options.session === undefined ? {} : { session: options.session }),
      };
      calls.push(call);
      const index = calls.length - 1;
      const reply = typeof replies === 'function' ? replies(call, index) : (replies[index] ?? []);
      if (reply instanceof Error) throw reply;
      return { value: reply, at: Date.now() } satisfies OpencliResult;
    },
  };
  return { opencli, calls, keys: () => calls.map((call) => call.key) };
}
