import { useSyncExternalStore } from 'react';
import { longTaskPollMs, type FactTransportMode } from '@dsh-workbench/shared';

import {
  LONG_TASKS_ROUTE,
  type ShellLongTaskRow,
  type ShellLongTasksPayload,
} from '@/kernel/contract/long-tasks';
import { requestResource } from './use-api-resource';
import { factTransportMode, subscribeFactTransportMode } from './fact-transport';
import { subscribeFactRevision } from './use-facts';

const SSE_HEARTBEAT_MS = 30_000;

let rows: readonly ShellLongTaskRow[] = [];
let stopFacts: (() => void) | null = null;
let stopMode: (() => void) | null = null;
let stopVisibility: (() => void) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let mode: FactTransportMode | null = null;
let seq = 0;

const listeners = new Set<() => void>();

function publish(next: readonly ShellLongTaskRow[]): void {
  rows = next;
  for (const listener of [...listeners]) listener();
}

function read(): void {
  const mine = (seq += 1);
  const flight = requestResource<ShellLongTasksPayload>(LONG_TASKS_ROUTE, {}, LONG_TASKS_ROUTE);
  void flight.task
    .then((response) => {
      if (mine !== seq) return;
      if (response.ok) publish(response.runs);
    })
    .catch(() => undefined)
    .finally(flight.release);
}

function hidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

function every(): number {
  return mode === 'sse' ? SSE_HEARTBEAT_MS : longTaskPollMs(rows.length > 0);
}

function clearTimer(): void {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
}

function schedule(): void {
  clearTimer();
  if (listeners.size === 0 || hidden()) return;
  timer = setTimeout(tick, every());
}

function tick(): void {
  timer = null;
  if (listeners.size === 0 || hidden()) return;
  read();
  schedule();
}

function watchVisibility(): void {
  if (typeof document === 'undefined') return;
  const onChange = (): void => {
    if (document.hidden) {
      clearTimer();
      return;
    }
    read();
    schedule();
  };
  document.addEventListener('visibilitychange', onChange);
  stopVisibility = () => document.removeEventListener('visibilitychange', onChange);
}

function start(): void {
  mode = factTransportMode();
  stopMode = subscribeFactTransportMode((next) => {
    mode = next;
    schedule();
  });
  stopFacts = subscribeFactRevision(LONG_TASKS_ROUTE, read);
  watchVisibility();
  read();
  schedule();
}

function stop(): void {
  clearTimer();
  stopFacts?.();
  stopMode?.();
  stopVisibility?.();
  stopFacts = null;
  stopMode = null;
  stopVisibility = null;
  mode = null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

function snapshot(): readonly ShellLongTaskRow[] {
  return rows;
}

export function useShellLongTasks(): readonly ShellLongTaskRow[] {
  return useSyncExternalStore(subscribe, snapshot);
}
