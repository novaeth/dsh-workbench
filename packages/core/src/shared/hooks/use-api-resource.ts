import { useEffect, useRef, useState } from 'react';
import type { ApiResponse, Query } from '@dsh-workbench/shared';
import { apiGet } from '@dsh-workbench/shared';
import { factOfRoute } from '@dsh-workbench/shared';

import { useFactRevision } from './use-facts';
import { reportPanelRead, unitOfRoute } from './panel-state-report';
import { IDLE, LOADING, resourceViewOf, type ResourceState, type TaggedState } from './resource-view';

/**
 * 一次读的状态：`idle` 没开读 · `loading` 在飞 · `ready` 有值 · `error` 失败；`value` 是 `ApiResponse<T>`、
 * `at` 是拿到这个值的时间戳。**身份没变的重取（如点刷新）进 `loading` 时上一次的 `value` 与 `at` 会留着**
 * —— 界面照旧有得画；身份变了、本来就没值、或读到 `error` 时才没有（那时两者都是 `undefined`）。
 */
export type { ResourceState } from './resource-view';

/**
 * 这次读的身份：`route` 加排好序的 `query`（排序是为了同一次读只有一个 key）；给了 `override` 就用它。
 */
export function resourceIdentity(route: string, query: Query, override?: string | undefined): string {
  return override ?? requestKeyOf(route, query);
}

/**
 * 把身份与两个版本号拼成合流用的 key：同一个 key 的并发读共享同一条请求。
 */
export function readKeyOf(identity: string, refreshToken: number, factRev: number): string {
  return `${identity}@${String(refreshToken)}@${String(factRev)}`;
}

function requestKeyOf(route: string, query: Query): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))) {
    search.set(key, String(value));
  }
  return `${route}?${search.toString()}`;
}

interface Flight {
  readonly task: Promise<ApiResponse<unknown>>;
  readonly controller: AbortController;
  waiters: number;
}

const inflight = new Map<string, Flight>();

/**
 * 非 hook 的取数本体（要自己管缓存时才直接调）：同一个 `key` 只发一次，并发调用共享同一个 `task`；
 * 用它就一定要 `release`（一般放 `finally`），最后一个 `release` 才 abort，否则那条请求永不取消。
 */
export function requestResource<T>(
  route: string,
  query: Query,
  key: string,
): { task: Promise<ApiResponse<T>>; release: () => void } {
  const pending = inflight.get(key);
  if (pending !== undefined) {
    pending.waiters += 1;
    return { task: pending.task as Promise<ApiResponse<T>>, release: () => release(key, pending) };
  }

  const controller = new AbortController();
  const entry = {
    task: apiGet<T>(route, query, { signal: controller.signal }).finally(() => {
      if (inflight.get(key) === entry) inflight.delete(key);
    }) as Promise<ApiResponse<unknown>>,
    controller,
    waiters: 1,
  };
  inflight.set(key, entry);
  return { task: entry.task as Promise<ApiResponse<T>>, release: () => release(key, entry) };
}

function release(key: string, entry: Flight): void {
  if (inflight.get(key) !== entry) return;
  entry.waiters -= 1;
  if (entry.waiters > 0) return;
  inflight.delete(key);
  entry.controller.abort();
}

/**
 * 卡片里所有的读都走它：按身份发一次 `apiGet`，同 key 合流、订阅事实通道（这条变了自动重取）、
 * 并把读数上报面板（`workbench_diy_panel` 看的就是它）；身份或版本号一变就换一条读，旧的当场取消。
 * `options.enabled` 为 `false` 时不发请求、相位恒为 `idle`；`key` 覆盖身份、`fact` 换订阅哪条事实
 * （默认 `factOfRoute(route)`）、`report: false` 不上报（夹具与后台探针用）。身份没变的重取会留住上一格
 * 的 `value`，相位降到 `loading`。
 */
export function useApiResource<T>(
  route: string,
  query: Query,
  refreshToken: number,
  options: { enabled?: boolean; key?: string; fact?: string; report?: boolean } = {},
): ResourceState<T> {
  const enabled = options.enabled !== false;
  const identity = resourceIdentity(route, query, options.key);
  const factRev = useFactRevision(options.fact ?? factOfRoute(route));

  const key = readKeyOf(identity, refreshToken, factRev);
  const [current, setCurrent] = useState<TaggedState<T>>(() => ({
    identity,
    state: enabled ? LOADING : IDLE,
  }));
  const lastIdentity = useRef<string | null>(null);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  useEffect(() => {
    if (!enabled) {
      lastIdentity.current = null;
      return undefined;
    }
    let cancelled = false;
    const put = (state: ResourceState<T>): void => setCurrent({ identity, state });
    const sameIdentity = lastIdentity.current === identity;
    lastIdentity.current = identity;
    setCurrent((prev) => ({
      identity,
      state:
        sameIdentity && prev.state.value !== undefined
          ? {
              phase: 'loading',
              value: prev.state.value,
              ...(prev.state.at === undefined ? {} : { at: prev.state.at }),
            }
          : LOADING,
    }));

    const flight = requestResource<T>(route, queryRef.current, key);
    const owner = options.report === false ? null : unitOfRoute(route);
    if (owner !== null) reportPanelRead({ unit: owner, route, phase: 'loading' });
    flight.task
      .then((response) => {
        if (cancelled) return;
        if (response.ok) {
          put({ phase: 'ready', value: response, at: Date.now() });
          if (owner !== null) reportPanelRead({ unit: owner, route, phase: 'ready' });
          return;
        }
        put({ phase: 'error', error: response.error });
        if (owner !== null) {
          reportPanelRead({
            unit: owner,
            route,
            phase: 'error',
            error: { code: response.error.code, message: response.error.message },
          });
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        put({
          phase: 'error',
          error: { code: 'network', message },
        });
        if (owner !== null) {
          reportPanelRead({ unit: owner, route, phase: 'error', error: { code: 'network', message } });
        }
      });

    return () => {
      cancelled = true;
      flight.release();
    };
  }, [key, identity, route, refreshToken, factRev, enabled, options.fact, options.report]);

  return resourceViewOf(enabled, current, identity);
}
