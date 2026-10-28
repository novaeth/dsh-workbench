import type { DataError, DataRequest, DataResult, LibRunner } from '@dsh-workbench/shared';

export type OpencliRead = (
  request: DataRequest,
) => Promise<DataResult<unknown>>;

export interface OpencliRunnerOptions {
  readonly timeoutMs?: number;
}

const AUTH_REQUIRED_EXIT_CODE = 77;

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function failedOf(args: readonly string[], error: DataError | undefined): Error {
  const head = `Command failed: opencli ${args.join(' ')}`;
  const auth = error?.pageCode === 'auth-required';
  const helpUrl = textOf(error?.helpUrl);
  const detail = textOf(error?.detail);
  const hint = textOf(error?.hint);
  const failed = new Error(
    [
      head,
      ...(auth
        ? ['code: AUTH_REQUIRED', `message: ${textOf(error?.message)}`]
        : [textOf(error?.message) || 'opencli 这条命令没跑通']),
      ...(detail === '' ? [] : [detail]),
      ...(hint === '' ? [] : [hint]),
      ...(auth && helpUrl !== ''
        ? [`help: Please open Chrome or Chromium and log in to ${helpUrl}`]
        : []),
    ].join('\n'),
  );
  if (auth) (failed as Error & { code?: number }).code = AUTH_REQUIRED_EXIT_CODE;
  return failed;
}

export function opencliRunnerOf(
  read: OpencliRead,
  options: OpencliRunnerOptions = {},
): LibRunner {
  return async (args) => {
    const result = await read({
      kind: 'command',
      adapter: 'opencli',
      argv: [...args],
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
    });
    if (result.ok) return { stdout: JSON.stringify(result.data) };
    throw failedOf(args, result.error);
  };
}
