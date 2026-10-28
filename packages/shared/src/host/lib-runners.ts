import type { LibNeed } from '../contract/needs.js';
import type { LibReader } from '../contract/lib.js';
import type { LibRunner } from '../contract/runner.js';

export type LibRuntimes = Readonly<Record<string, LibRunner>>;

interface Logger {
  warn?(message: string): void;
}

function runnerOf(runtimes: LibRuntimes, runtime: string): LibRunner | undefined {
  return runtimes[runtime];
}

function setterNameOf(runtime: string): string {
  return `set${runtime.charAt(0).toUpperCase()}${runtime.slice(1)}Runner`;
}

/**
 * 给声明了 `runs` 的 lib 注入「跑这个运行时」的执行器：库侧按约定暴露 `setOpencliRunner`
 * （运行时名字首字母大写 + `Runner`），外壳在每次 `load` 之后把执行器交给它。
 *
 * 没暴露的（版本旧）就保持它自己的行为（按 PATH 找），只记一条 warn；不熟悉的运行时同样只 warn。
 * @param libs 原来的读库口。
 * @param runtimes 外壳手上有的执行器，按运行时名字给。
 * @param logger 记 warn 的地方（默认不记）。
 * @returns 包好的读库口；`load` 的签名与返回不变。
 */
export function withLibRunners(
  libs: LibReader,
  runtimes: LibRuntimes,
  logger?: Logger,
): LibReader {
  const warned = new Set<string>();
  const warnOnce = (key: string, message: string): void => {
    if (warned.has(key)) return;
    warned.add(key);
    logger?.warn?.(message);
  };
  return {
    async load<T = unknown>(need: LibNeed, entry: string): Promise<T> {
      const module = await libs.load<T>(need, entry);
      for (const runtime of need.runs ?? []) {
        const runner = runnerOf(runtimes, runtime);
        if (runner === undefined) {
          warnOnce(
            `${need.name}:${runtime}:unsupported`,
            `[dsh-workbench] ${need.name} 声明了自己会跑 ${runtime}，但工作台没有这个执行器 —— 它会按自己的方式找`,
          );
          continue;
        }
        const setter =
          typeof module === 'object' && module !== null
            ? (module as Record<string, unknown>)[setterNameOf(runtime)]
            : undefined;
        if (typeof setter !== 'function') {
          warnOnce(
            `${need.name}:${entry}:${runtime}:missing`,
            `[dsh-workbench] ${need.name} 声明了自己会跑 ${runtime}，但这一版没有 ${setterNameOf(runtime)} —— 它会按 PATH 找`,
          );
          continue;
        }
        (setter as (runner: LibRunner) => void).call(module, runner);
      }
      return module;
    },
  };
}
