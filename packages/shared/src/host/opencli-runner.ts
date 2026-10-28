import type { DataError, DataRequest, DataResult } from '../contract/data.js';

/**
 * 一条 opencli 命令的执行器：同一形状的 `execFile('opencli', args)`，结果只留 stdout。
 */
export type OpencliRunner = (
  args: readonly string[],
) => Promise<{ readonly stdout: string }>;

/**
 * 读缝（`DataReader.read`）的形状；模块直接把自己的 `data.read` 传进来即可。
 */
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

/**
 * 把读缝包成一条 opencli 命令的执行器：给还按 `execFile('opencli', args)` 收结果的编排库用，
 * 让它们跑在面板用的那份 opencli 上（同一套插件、同一份登录态）。
 *
 * 失败按 opencli 自己的约定还原：未登录是 `code: AUTH_REQUIRED` + 退出码 77，编排库的
 * 「等登录再重试」才接得上；其它失败保留 `Command failed: opencli …` 那句外壳。
 * @param read 模块手里的读缝（`data.read`）。
 * @param options `timeoutMs` 透传给读缝；不传就用读缝自己的默认值。
 * @returns 执行器；直接交给编排库的 `setOpencliRunner`。
 */
export function opencliRunnerOf(
  read: OpencliRead,
  options: OpencliRunnerOptions = {},
): OpencliRunner {
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
