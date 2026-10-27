import { useCallback, useEffect, useState } from 'react';
import {
  longTaskIsLive,
  longTaskPollMs,
  longTaskRunsOf,
  runsRouteOf,
  stopRouteOf,
  type LongTaskStatus,
  type LongTasksPayload,
  type WriteOutcome,
} from '@dsh-workbench/shared';

import { useApiResource } from './use-api-resource';
import { useHostWrite } from './use-host-write';

/**
 * 这一单元的长任务清单与停止口：`runs` 是这次读交回的那一批（读数还没回来时是空数组）；
 * `stop(id)` 请外壳停某一趟 —— 回执没成就带回一句人话（调用点自己决定说不说）；
 * `stopping` 是正在请求停止的那一趟 id（没有就是 `null`），`stopFailed` 是上一次停止请求失败那句话（没有就是 `null`）。
 * `refresh()` 让这一格**立刻**重读一次（不必等下一拍轮询）—— 自己写完/发起完之后用它，
 * 别去拼读口路由、也别为一个读数去碰事实通道。
 */
export interface LongTaskFeed<T> {
  readonly runs: readonly T[];
  stop(id: string): Promise<WriteOutcome<unknown>>;
  readonly stopping: string | null;
  readonly stopFailed: string | null;
  refresh(): void;
}

/**
 * 卡片要轮询长任务那一行时调用：有在跑的（`running` / `needs-login`）按 `longTaskPollMs` 走快档、空闲走慢档；
 * `workspace` 为 `null`、`mocked: true` 或 `enabled: false` 时不轮。换单元 / 换工作区就是换读数身份，
 * 旧那批立刻清空、读数回来前 `runs` 是空数组。
 * `stop(id)` 走 actions 通道的 `<单元>/runs/stop`；不在跑的那一趟会带回一句人话，不抛错。
 */
export function useLongTask<T extends { readonly id: string; readonly status: LongTaskStatus }>(options: {
  readonly unit: string;
  readonly workspace: string | null;
  readonly mocked?: boolean | undefined;
  readonly enabled?: boolean | undefined;
  readonly pollMs?: number | undefined;
}): LongTaskFeed<T> {
  const enabled = options.enabled !== false && options.mocked !== true && options.workspace !== null;
  const [tick, setTick] = useState(0);
  const state = useApiResource<LongTasksPayload>(
    runsRouteOf(options.unit),
    { path: options.workspace ?? undefined },
    tick,
    { enabled },
  );
  const runs = longTaskRunsOf<T>(state);
  const write = useHostWrite<unknown>({
    channel: 'actions',
    resource: stopRouteOf(options.unit),
    networkText: '网络不通，停止请求没发出去',
  });
  const [stopping, setStopping] = useState<string | null>(null);
  const send = write.send;

  const stop = useCallback(
    async (id: string): Promise<WriteOutcome<unknown>> => {
      setStopping(id);
      try {
        return await send({ id });
      } finally {
        setStopping((current) => (current === id ? null : current));
      }
    },
    [send],
  );

  const live = runs.some((run) => longTaskIsLive(run.status));
  const every = longTaskPollMs(live, options.pollMs);
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setTick((count) => count + 1), every);
    return () => clearInterval(timer);
  }, [enabled, every]);

  const refresh = useCallback(() => setTick((count) => count + 1), []);

  return { runs, stop, stopping, stopFailed: write.failed, refresh };
}
