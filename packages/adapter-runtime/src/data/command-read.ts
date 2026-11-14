import type { DataCallOptions, DataErrorCode, DataRequest, DataResult, Seam } from '@dsh-workbench/shared/host';
import { WorkbenchDataError } from '@dsh-workbench/shared/host';
import { createOpencli } from '../cli/index.js';
import { DEFAULT_TIMEOUT_MS } from './http.js';
import { failure } from './result.js';

export function createCommandRead(options: {
  readonly seam: Seam | undefined;
  readonly command: string;
}): (request: Extract<DataRequest, { kind: 'command' }>, callOptions: DataCallOptions) => Promise<DataResult<unknown>> {
  const openclis = new Map<string, ReturnType<typeof createOpencli>>();
  const opencliOf = (plugin: string, timeoutMs: number): ReturnType<typeof createOpencli> => {
    const key = `${plugin}:${String(timeoutMs)}`;
    const cached = openclis.get(key);
    if (cached !== undefined) return cached;
    const created = createOpencli({ seam: options.seam as Seam, plugin, command: options.command, timeoutMs });
    openclis.set(key, created);
    return created;
  };
  return async (request, callOptions) => {
    if (callOptions.signal?.aborted === true) return failure('aborted', '已停止', { pageCode: 'aborted' });
    if (options.seam === undefined) return failure('invalid-request', '没有执行缝，跑不了命令');
    if (request.adapter !== 'opencli') {
      return failure('invalid-request', `不认识的命令适配器：${request.adapter}`);
    }
    const plugin = request.argv[0];
    if (plugin === undefined) return failure('invalid-request', '命令缺少 argv[0]（插件名）');
    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const { value } = await opencliOf(plugin, timeoutMs).json(request.argv.slice(1));
      return { ok: true, data: value };
    } catch (error) {
      if (!(error instanceof WorkbenchDataError)) return failure('command', String(error));
      const code: DataErrorCode =
        error.code === 'auth-required'
          ? 'auth'
          : error.code === 'permission-denied'
            ? 'permission-denied'
            : error.code === 'cli-timeout'
            ? 'timeout'
            : error.code === 'cli-bad-output'
              ? 'parse'
              : 'command';
      return failure(code, error.message, {
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        ...(error.hint === undefined ? {} : { hint: error.hint }),
        ...(error.helpUrl === undefined ? {} : { helpUrl: error.helpUrl }),
        pageCode: error.code,
      });
    }
  };
}
