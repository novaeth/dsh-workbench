import type { DshToolRunContext } from '../api/dsh.js';
import { WorkbenchDataError } from './opencli.js';

export function sessionWorkspace(exec: DshToolRunContext | undefined): string | null {
  const cwd = exec?.agent?.session?.header?.cwd;
  return typeof cwd === 'string' && cwd.trim() !== '' ? cwd.trim() : null;
}

export function sessionIdOf(exec: DshToolRunContext | undefined): string | null {
  const id = exec?.agent?.session?.id;
  return typeof id === 'string' && id.trim() !== '' ? id.trim() : null;
}

export function textOutput(text: string): Array<Record<string, unknown>> {
  return [{ type: 'text', text }];
}

export function textRender(_args: unknown, value: unknown): Array<Record<string, unknown>> {
  const text = (value as { text?: unknown } | null)?.text;
  return textOutput(typeof text === 'string' ? text : JSON.stringify(value));
}

export const TEXT_OUTPUT = { schema: { type: 'object', properties: {}, additionalProperties: true }, render: textRender };

export function jsonText(value: unknown): string {
  return JSON.stringify(value);
}

const UNCLASSIFIED = 'cli-unclassified';

export interface CommandHintNames {
  readonly plugin: string;
  readonly suiteId: string;
}

export type CommandHint = <T>(command: string, run: () => Promise<T>) => Promise<T>;

export function commandHintFor(names: CommandHintNames): CommandHint {
  return async (command, run) => {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof WorkbenchDataError) || error.code !== UNCLASSIFIED) throw error;

      const advice =
        `这条命令（${command}）在这份 ${names.plugin} 插件里可能不存在（插件版本旧就会缺）：` +
        `用 workbench_modules_update（id=${names.suiteId}）升级插件，或在面板的模块状态里点更新，再重试。`;

      throw new WorkbenchDataError(error.code, `${error.message}。${advice}`, {
        ...(error.detail === undefined ? {} : { detail: error.detail }),
        hint:
          `升级：workbench_modules_update（id=${names.suiteId}）。` +
          `终端确认：opencli ${names.plugin} ${command} --help${
            error.hint === undefined ? '' : `\n${error.hint}`
          }`,
        ...(error.helpUrl === undefined ? {} : { helpUrl: error.helpUrl }),
        ...(error.project === undefined ? {} : { project: error.project }),
      });
    }
  };
}
