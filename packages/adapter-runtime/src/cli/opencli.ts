import type { DshShell } from '@dsh-workbench/shared';
import { OPENCLI_MAX_CONCURRENT, OPENCLI_TIMEOUT_MS } from '@dsh-workbench/shared/host';
import { parseJsonLoose } from '@dsh-workbench/shared/host';
import { quoteShellArgFor, tailLines } from '@dsh-workbench/shared/host';
import { helpUrlOf, parseCliErrorEnvelope } from '@dsh-workbench/shared/host';
import { OPENCLI_WINDOW_ENV } from './opencli-window.js';
import { runShell } from '@dsh-workbench/shared/host';
import type { Opencli, OpencliResult, OpencliSession } from './opencli-types.js';
import { WorkbenchDataError } from '@dsh-workbench/shared/host';

const FORBIDDEN_CODES = new Set(['FORBIDDEN', 'PERMISSION_DENIED']);

const SITE_SESSION_ARGS = ['--site-session', 'persistent'] as const;

export function opencliCommandLine(
  command: string,
  argv: readonly string[],
  session: OpencliSession = 'persistent',
  platform: NodeJS.Platform = process.platform,
): string {
  return [
    quoteShellArgFor(command, platform),
    ...argv.map((arg) => quoteShellArgFor(arg, platform)),
    ...(session === 'persistent' ? SITE_SESSION_ARGS : []),
    '-f',
    'json',
  ].join(' ');
}

export function createOpencli(options: {
  shell: DshShell;
  plugin: string;
  logger?: { warn?(message: string): void } | undefined;
  command?: string;
  timeoutMs?: number;
  maxConcurrent?: number;
}): Opencli {
  const {
    shell,
    plugin,
    logger,
    command = 'opencli',
    timeoutMs = OPENCLI_TIMEOUT_MS,
    maxConcurrent = OPENCLI_MAX_CONCURRENT,
  } = options;

  const inflight = new Map<string, Promise<OpencliResult>>();

  const MAX_CONCURRENT = maxConcurrent;
  let running = 0;
  const waiting: Array<() => void> = [];

  async function acquire(): Promise<void> {
    if (running < MAX_CONCURRENT) {
      running += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  function release(): void {
    const next = waiting.shift();
    if (next === undefined) running -= 1;
    else next();
  }

  async function runLimited<T>(task: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  }

  async function call(commandLine: string, workdir: string | undefined): Promise<unknown> {
    let result;
    try {
      result = await runShell(shell, commandLine, {
        ...(workdir === undefined ? {} : { workdir }),
        timeoutMs,
        env: OPENCLI_WINDOW_ENV,
      });
    } catch (error) {
      throw new WorkbenchDataError('cli-exec-failed', `执行 opencli 失败：${String(error)}`, {
        hint: '确认 opencli 已安装，并且在 PATH 里。',
      });
    }

    if (result.timedOut) {
      throw new WorkbenchDataError(
        'cli-timeout',
        `opencli 超过 ${Math.round(timeoutMs / 1000)} 秒没有返回`,
        { hint: '无头浏览器可能没起来，重试一次通常就好。' },
      );
    }

    if (result.exitCode !== 0) {
      const detail = tailLines(result.stderr || result.stdout, 6);
      const envelope = parseCliErrorEnvelope(result.stderr) ?? parseCliErrorEnvelope(result.stdout);

      const url = envelope === undefined ? undefined : helpUrlOf(envelope);
      if (envelope?.code === 'AUTH_REQUIRED') {
        throw new WorkbenchDataError('auth-required', envelope.message, {
          detail,
          ...(url === undefined ? {} : { helpUrl: url }),
        });
      }
      if (envelope !== undefined && FORBIDDEN_CODES.has(envelope.code)) {
        throw new WorkbenchDataError('permission-denied', envelope.message, {
          detail,
          ...(url === undefined ? {} : { helpUrl: url }),
        });
      }
      if (envelope !== undefined) {
        throw new WorkbenchDataError('cli-command-failed', `${envelope.code}：${envelope.message}`, {
          detail,
          ...(envelope.help === undefined ? {} : { hint: envelope.help }),
        });
      }
      throw new WorkbenchDataError(
        'cli-unclassified',
        `opencli 这条命令没跑通（退出码 ${result.exitCode}），而且没有结构化错误码`,
        {
          detail,
          hint: '多半是插件里没有这条命令（版本旧就会缺），也可能是命令自己失败了：先确认命令存在，再更新插件重试。',
        },
      );
    }

    const parsed = parseJsonLoose(result.stdout);
    if (parsed === undefined) {
      throw new WorkbenchDataError('cli-bad-output', 'opencli 输出不是 JSON', {
        detail: tailLines(result.stdout, 4),
      });
    }
    return parsed;
  }

  async function json(
    args: readonly string[],
    callOptions: { key?: string; workdir?: string; session?: OpencliSession } = {},
  ): Promise<OpencliResult> {
    const { key, workdir } = callOptions;
    const session = callOptions.session ?? 'persistent';
    const callKey = key ?? args.map((arg) => String(arg)).join(' ');

    const pending = inflight.get(callKey);
    if (pending !== undefined) return pending;

    const commandLine = opencliCommandLine(command, [plugin, ...args], session);

    const once = async (): Promise<OpencliResult> => {
      const value = await call(commandLine, workdir);
      return { value, at: Date.now() };
    };

    const task = runLimited(async (): Promise<OpencliResult> => {
      try {
        return await once();
      } catch (error) {
        if (!(error instanceof WorkbenchDataError) || error.code !== 'auth-required') throw error;
        return await once();
      }
    });

    inflight.set(callKey, task);
    try {
      return await task;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger?.warn?.(`[dsh-workbench] opencli 调用失败：${message}`);
      throw error;
    } finally {
      inflight.delete(callKey);
    }
  }

  return { json };
}
