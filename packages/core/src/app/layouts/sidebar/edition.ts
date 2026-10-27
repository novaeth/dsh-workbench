import { useSyncExternalStore } from 'react';
import type { SidebarEdition } from '@/kernel/contract/sidebar-edition';

let runtime: SidebarEdition = 'official';
const listeners = new Set<() => void>();

export function runtimeSidebarEdition(): SidebarEdition {
  return runtime;
}

export function setRuntimeSidebarEdition(next: SidebarEdition): void {
  if (next === runtime) return;
  runtime = next;
  for (const listener of listeners) listener();
}

export function subscribeSidebarEdition(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useRuntimeSidebarEdition(): SidebarEdition {
  return useSyncExternalStore(subscribeSidebarEdition, runtimeSidebarEdition, runtimeSidebarEdition);
}
