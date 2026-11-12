import type { DshHostContext } from '@dsh-workbench/shared';
import type { DebugStore } from '@dsh-workbench/shared/host';
import { join } from 'node:path';
import { BROWSER_SCREEN_SESSION, seamOf } from '@dsh-workbench/shared/host';
import { artifactsDirOf } from '@/shared/api/host/diy-artifacts';
import { cliCommandOf } from '@dsh-workbench/shared/host';
import { actBrowser, SWEEP_TIMEOUT_MS } from './diy-browser-act';
import { liveCaptureOf, stopLiveCapture } from '@/shared/api/host/diy-capture-live';
import { LOGS_STOP_SCRIPT } from './diy-logs';

export interface ObserverCleanup {
  readonly net: boolean;
  readonly logs: boolean;
}

export interface CleanupLog {
  warn?(message: string): void;
}

export async function stopObservers(
  ctx: DshHostContext,
  workspace: string | null | undefined,
  session: string = BROWSER_SCREEN_SESSION,
): Promise<ObserverCleanup> {
  const seam = seamOf(ctx);
  if (workspace === null || workspace === undefined || workspace === '' || seam === undefined) {
    return { net: false, logs: false };
  }
  const file = join(artifactsDirOf(workspace), `net-${session}.jsonl`);
  const command = cliCommandOf(ctx);
  const [stopped, step] = await Promise.all([
    Promise.resolve(stopLiveCapture(file)),
    actBrowser(seam, command, session, ['eval', LOGS_STOP_SCRIPT], SWEEP_TIMEOUT_MS),
  ]);
  return { net: stopped || !liveCaptureOf(file), logs: typeof step.payload?.['unhooked'] === 'number' };
}

export function withObserverCleanup(
  store: DebugStore,
  cleanup: (workspace: string | null) => Promise<ObserverCleanup>,
  logger?: CleanupLog | undefined,
): DebugStore {
  let pending: Promise<void> = Promise.resolve();
  let epoch = 0;

  const sweep = async (at: number, workspace: string | null): Promise<void> => {
    if (epoch !== at) {
      logger?.warn?.('结束阶段：已经有新的调试约定开始 —— 跳过收尾观察（新一场自行收尾）');
      return;
    }
    try {
      const out = await cleanup(workspace);
      if (!out.net || !out.logs) {
        logger?.warn?.(
          `结束阶段未完成观察收尾（网络 ${String(out.net)} / 日志 ${String(out.logs)}）—— ` +
            '网络观察最多 15 分钟后自动结束，日志钩子随页面刷新消失',
        );
      }
    } catch (error) {
      logger?.warn?.(`结束阶段收尾观察时抛出异常：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return {
    live: (now) => store.live(now),
    begin(pact) {
      epoch += 1;
      return store.begin(pact);
    },
    pause: (sessionId, now) => store.pause(sessionId, now),
    resume: (sessionId, now) => store.resume(sessionId, now),
    stop(sessionId, now) {
      const move = store.stop(sessionId, now);
      if (move.ok) {
        const at = epoch;
        const workspace = move.state.workspacePath;
        pending = pending.then(() => sweep(at, workspace));
      }
      return move;
    },
    settle: () => pending,
  };
}
