import { useCallback, useEffect, useState } from 'react';
import {
  answerRouteOf,
  longTaskIsLive,
  longTaskPollMs,
  longTaskRunsOf,
  recheckRouteOf,
  runsRouteOf,
  stopRouteOf,
  type LongTaskStatus,
  type LongTasksPayload,
  type WriteOutcome,
} from '@dsh-workbench/shared';

import { useApiResource } from './use-api-resource';
import { useHostWrite } from './use-host-write';

/**
 * 这一单元的长任务清单与三个写口：`runs` 是这次读交回的那一批（读数还没回来时是空数组）；
 * `stop(id)` 请外壳停某一趟 —— 回执没成就带回一句人话（调用点自己决定说不说）；
 * `stopping` 是正在请求停止的那一趟 id（没有就是 `null`），`stopFailed` 是上一次停止请求失败那句话（没有就是 `null`）。
 * `recheck(id)` 是「我处理完了」：只请模块再看一眼、外壳不承诺恢复；`rechecking` / `recheckFailed` 与停止那一对同形。
 * `answer(id, values)` 交结构化回执：值只回给模块、外壳不落快照；`answering` / `answerFailed` 同上那一对。
 * `refresh()` 让这一格**立刻**重读一次（不必等下一拍轮询）—— 自己写完/发起完之后用它，
 * 别去拼读口路由、也别为一个读数去碰事实通道。
 */
export interface LongTaskFeed<T> {
  readonly runs: readonly T[];
  stop(id: string): Promise<WriteOutcome<unknown>>;
  readonly stopping: string | null;
  readonly stopFailed: string | null;
  recheck(id: string): Promise<WriteOutcome<unknown>>;
  readonly rechecking: string | null;
  readonly recheckFailed: string | null;
  answer(id: string, values: Readonly<Record<string, string>>): Promise<WriteOutcome<unknown>>;
  readonly answering: string | null;
  readonly answerFailed: string | null;
  refresh(): void;
}

/**
 * 卡片要轮询长任务那一行时调用：有在跑的（`running` / `needs-human` / `needs-login`）按 `longTaskPollMs` 走快档、空闲走慢档；
 * `workspace` 为 `null`、`mocked: true` 或 `enabled: false` 时不轮。换单元 / 换工作区就是换读数身份，
 * 旧那批立刻清空、读数回来前 `runs` 是空数组。
 * `stop(id)` 走 actions 通道的 `<单元>/runs/stop`；不在跑的那一趟会带回一句人话，不抛错。
 * `recheck(id)` 走 actions 通道的 `<单元>/runs/recheck`（「我处理完了」）：同样不抛错。
 * `answer(id, values)` 走 actions 通道的 `<单元>/runs/answer`：回执值只进请求体、不进事实。
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
  const recheckWrite = useHostWrite<unknown>({
    channel: 'actions',
    resource: recheckRouteOf(options.unit),
    networkText: '网络不通，重查请求没发出去',
  });
  const answerWrite = useHostWrite<unknown>({
    channel: 'actions',
    resource: answerRouteOf(options.unit),
    networkText: '网络不通，回执没交出去',
  });
  const [stopping, setStopping] = useState<string | null>(null);
  const [rechecking, setRechecking] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);
  const send = write.send;
  const sendRecheck = recheckWrite.send;
  const sendAnswer = answerWrite.send;

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

  const recheck = useCallback(
    async (id: string): Promise<WriteOutcome<unknown>> => {
      setRechecking(id);
      try {
        const outcome = await sendRecheck({ id });
        setTick((count) => count + 1);
        return outcome;
      } finally {
        setRechecking((current) => (current === id ? null : current));
      }
    },
    [sendRecheck],
  );

  const answer = useCallback(
    async (id: string, values: Readonly<Record<string, string>>): Promise<WriteOutcome<unknown>> => {
      setAnswering(id);
      try {
        const outcome = await sendAnswer({ id, values });
        setTick((count) => count + 1);
        return outcome;
      } finally {
        setAnswering((current) => (current === id ? null : current));
      }
    },
    [sendAnswer],
  );

  const live = runs.some((run) => longTaskIsLive(run.status));
  const every = longTaskPollMs(live, options.pollMs);
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setTick((count) => count + 1), every);
    return () => clearInterval(timer);
  }, [enabled, every]);

  useEffect(() => {
    if (!enabled || !live || typeof document === 'undefined') return undefined;
    const onVisible = (): void => {
      if (!document.hidden) setTick((count) => count + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, live]);

  const refresh = useCallback(() => setTick((count) => count + 1), []);

  return {
    runs,
    stop,
    stopping,
    stopFailed: write.failed,
    recheck,
    rechecking,
    recheckFailed: recheckWrite.failed,
    answer,
    answering,
    answerFailed: answerWrite.failed,
    refresh,
  };
}
