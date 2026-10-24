import { useCallback, useRef, useState } from 'react';
import { apiPost } from '@dsh-workbench/shared';
import type { WriteChannel, WriteOutcome } from '@dsh-workbench/shared';
import { writeOutcomeOf, writeRoute } from '@/shared/api/write-outcome';

/**
 * 一个写通道的句柄：`busy` 在发、`failed` / `detail` 上一条人话失败（没有是 `null`）、
 * `send(body, { silent })` 回 `WriteOutcome`、`fail(message, detail?)` 本地就知道不行时自己塞一条、`clear()` 清掉。
 */
export interface HostWrite<T> {
  readonly busy: boolean;
  readonly failed: string | null;
  readonly detail: string | null;
  send(body: Record<string, unknown>, options?: { readonly silent?: boolean }): Promise<WriteOutcome<T>>;
  fail(message: string, detail?: string): void;
  clear(): void;
}

/**
 * 写通道的配置：`channel` 用哪个前缀、`resource` 挂在它的哪一格（多数通道留空）、`networkText` 网络不通时那句人话。
 */
export interface HostWriteOptions {
  readonly channel: WriteChannel;
  readonly resource?: string | undefined;
  readonly networkText: string;
}

/**
 * 组件里要写（发 POST）时调用 —— 写只走这条，别在组件里自己 `fetch`。
 * `send` 失败自动落到 `failed` + `detail`（界面直接显示，别自己拼）；`silent: true` 是不打扰：不动 `busy` / `failed`，
 * 结果只从返回值拿。返回的 `busy` 是这一路写有没有在飞。
 */
export function useHostWrite<T>(options: HostWriteOptions): HostWrite<T> {
  const { channel, networkText } = options;
  const resource = options.resource ?? '';
  const route = writeRoute(channel, resource);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const alive = useRef(true);

  const fail = useCallback((message: string, detail?: string): void => {
    setFailure({ message, ...(detail === undefined ? {} : { detail }) });
  }, []);

  const send = useCallback(
    async (body: Record<string, unknown>, callOptions?: { readonly silent?: boolean }): Promise<WriteOutcome<T>> => {
      const silent = callOptions?.silent === true;
      if (!silent) {
        setFailure(null);
        setBusy(true);
      }
      try {
        const response = await apiPost<T>(route, body).catch(() => null);
        const outcome = writeOutcomeOf<T>(response, networkText);
        if (!outcome.ok && !silent) fail(outcome.message, outcome.detail);
        return outcome;
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        const outcome = { ok: false, message: networkText, detail: text } as const;
        if (!silent) fail(outcome.message, outcome.detail);
        return outcome;
      } finally {
        if (!silent && alive.current) setBusy(false);
      }
    },
    [route, networkText, fail],
  );

  const clear = useCallback((): void => setFailure(null), []);

  return {
    busy,
    failed: failure?.message ?? null,
    detail: failure?.detail ?? null,
    send,
    fail,
    clear,
  };
}
