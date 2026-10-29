import type { DataReader } from '../contract/data.js';
import type { ExtensionCaller, ExtensionCallOptions, ExtensionValue } from '../contract/extension.js';
import type { ExtensionNeed } from '../contract/needs.js';
import { WorkbenchDataError } from './data-error.js';

function cliCodeOf(code: string): string {
  if (code === 'auth') return 'auth-required';
  if (code === 'timeout') return 'cli-timeout';
  if (code === 'parse') return 'cli-bad-output';
  return 'cli-exec-failed';
}

export interface ExtensionCallerOptions {
  readonly suiteId?: string | undefined;
}

export function extensionCallerOf(
  data: DataReader,
  need: ExtensionNeed,
  callerOptions: ExtensionCallerOptions = {},
): ExtensionCaller {
  return {
    async json(
      args: readonly string[],
      options: ExtensionCallOptions = {},
    ): Promise<ExtensionValue> {
      const result = await data.read({
        kind: 'command',
        adapter: need.runtime,
        argv: [need.name, ...args],
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      });
      if (result.ok) return { value: result.data, at: Date.now() };
      const code = result.error.pageCode ?? cliCodeOf(result.error.code);
      const command = [need.name, ...args].join(' ');
      const advice =
        code === 'cli-unclassified'
          ? `这条命令（${command}）在这份 ${need.name} 插件里可能不存在（插件版本旧就会缺）：用 workbench_modules_update（id=${callerOptions.suiteId ?? need.name}）升级，或在面板的模块状态里点更新，再重试。终端确认：${need.name} ${args[0] ?? ''} --help`
          : undefined;
      const hint =
        advice === undefined
          ? result.error.hint
          : result.error.hint === undefined
            ? advice
            : `${advice}\n${result.error.hint}`;
      throw new WorkbenchDataError(
        code,
        advice === undefined ? result.error.message : `${result.error.message}。${advice}`,
        {
          ...(result.error.detail === undefined ? {} : { detail: result.error.detail }),
          ...(hint === undefined ? {} : { hint }),
          ...(result.error.helpUrl === undefined ? {} : { helpUrl: result.error.helpUrl }),
        },
      );
    },
  };
}
