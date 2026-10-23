import type { DshHostContext, DshShell } from '@dsh-workbench/shared';
import type { DebugStore } from '@dsh-workbench/shared/host';
import { join } from 'node:path';
import { BROWSER_SCREEN_SESSION } from '@dsh-workbench/shared/host';
import { artifactsDirOf } from '@/shared/api/host/diy-artifacts';
import { opencliCommandOf } from '@/shared/api/host/opencli-command';
import { actBrowser, stopNetworkExact, SWEEP_TIMEOUT_MS } from './diy-browser-act';
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
  const shell = ctx.get<DshShell>('shell');
  if (workspace === null || workspace === undefined || workspace === '' || shell === undefined) {
    return { net: false, logs: false };
  }
  const file = join(artifactsDirOf(ctx, workspace), `net-${session}.jsonl`);
  const command = opencliCommandOf(ctx).command;
  const [net, step] = await Promise.all([
    stopNetworkExact(shell, file),
    actBrowser(shell, command, session, ['eval', LOGS_STOP_SCRIPT], SWEEP_TIMEOUT_MS),
  ]);
  return { net, logs: typeof step.payload?.['unhooked'] === 'number' };
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
      logger?.warn?.('收工那一拍：已经有新的调试约定开始了 —— 跳过收观察（新那一场自己收）');
      return;
    }
    try {
      const out = await cleanup(workspace);
      if (!out.net || !out.logs) {
        logger?.warn?.(
          `收工那一拍没把观察收干净（网络 ${String(out.net)} / 日志 ${String(out.logs)}）—— ` +
            '网络那条最多 15 分钟自己收工，日志钩子随页面刷新消失',
        );
      }
    } catch (error) {
      logger?.warn?.(`收工那一拍收观察抛了：${error instanceof Error ? error.message : String(error)}`);
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
