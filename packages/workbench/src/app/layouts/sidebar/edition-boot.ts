import type { DshClientContext } from '@dsh-workbench/shared';
import { readSidebarEdition } from '@/shared/hooks/sidebar-edition';
import type { SidebarEdition } from '@/shared/api/sidebar-edition';
import { runtimeSidebarEdition, setRuntimeSidebarEdition } from './edition';

const RETRY_KEY = 'dsh-workbench.sidebar-edition-retry';
const PENDING_KEY = 'dsh-workbench.sidebar-edition-pending';

function retryCount(): number {
  try {
    return Number(globalThis.sessionStorage?.getItem(RETRY_KEY) ?? '0') || 0;
  } catch {
    return 0;
  }
}

function setRetryCount(value: number): void {
  try {
    globalThis.sessionStorage?.setItem(RETRY_KEY, String(value));
  } catch {
    return;
  }
}

function pendingEdition(): SidebarEdition | null {
  try {
    const value = globalThis.sessionStorage?.getItem(PENDING_KEY);
    return value === 'official' || value === 'custom' ? value : null;
  } catch {
    return null;
  }
}

function clearPending(): void {
  try {
    globalThis.sessionStorage?.removeItem(PENDING_KEY);
  } catch {
    return;
  }
}

export function markSidebarEditionPending(edition: SidebarEdition): void {
  try {
    globalThis.sessionStorage?.setItem(PENDING_KEY, edition);
  } catch {
    return;
  }
}

let sideOwner: { readonly ctx: DshClientContext; readonly register: () => void } | null = null;
let takeoverArmed = false;
let takeoverStop: (() => void) | null = null;
let takeoverPoll: ReturnType<typeof setInterval> | null = null;

function settleCustomTakeover(): boolean {
  if (sideOwner === null) return false;
  if ((sideOwner.ctx.slots.entriesOfSlot?.('sidebar') ?? []).length > 0) return false;
  const owner = sideOwner;
  takeoverArmed = false;
  takeoverStop?.();
  takeoverStop = null;
  if (takeoverPoll !== null) {
    clearInterval(takeoverPoll);
    takeoverPoll = null;
  }
  clearPending();
  setRetryCount(0);
  setRuntimeSidebarEdition('custom');
  owner.register();
  return true;
}

export function armCustomSidebarTakeover(): void {
  if (sideOwner === null || takeoverArmed) return;
  takeoverArmed = true;
  if (settleCustomTakeover()) return;
  takeoverStop = sideOwner.ctx.slots.subscribe('sidebar', () => {
    if (takeoverArmed) settleCustomTakeover();
  });
  takeoverPoll = setInterval(() => {
    if (takeoverArmed) settleCustomTakeover();
  }, 100);
  setTimeout(() => {
    if (!takeoverArmed) return;
    takeoverArmed = false;
    takeoverStop?.();
    takeoverStop = null;
    if (takeoverPoll !== null) {
      clearInterval(takeoverPoll);
      takeoverPoll = null;
    }
    if (!settleCustomTakeover() && (sideOwner?.ctx.slots.entriesOfSlot?.('sidebar') ?? []).length > 0) {
      globalThis.location?.reload();
    }
  }, 3000);
}

export function disarmCustomSidebarTakeover(): void {
  takeoverArmed = false;
  takeoverStop?.();
  takeoverStop = null;
  if (takeoverPoll !== null) {
    clearInterval(takeoverPoll);
    takeoverPoll = null;
  }
}

export function bootSidebarEdition(ctx: DshClientContext, registerOwn: () => void): void {
  sideOwner = { ctx, register: registerOwn };
  let settled = false;
  const settle = (): void => {
    const official = (ctx.slots.entriesOfSlot?.('sidebar') ?? []).length > 0;
    const edition = runtimeSidebarEdition();
    const pending = pendingEdition();
    if (pending !== null && pending !== edition) clearPending();
    const wanted = pending === edition ? pending : null;
    if (wanted !== null) {
      const reached = wanted === 'official' ? official : !official;
      if (reached) {
        clearPending();
        setRetryCount(0);
        if (!official) registerOwn();
        return;
      }
      if (wanted === 'custom') {
        let done = false;
        const takeOver = (): void => {
          if (done) return;
          done = true;
          clearPending();
          setRetryCount(0);
          registerOwn();
        };
        ctx.slots.subscribe('sidebar', () => {
          if (done) return;
          if ((ctx.slots.entriesOfSlot?.('sidebar') ?? []).length === 0) takeOver();
        });
        setTimeout(() => {
          if (done) return;
          if ((ctx.slots.entriesOfSlot?.('sidebar') ?? []).length === 0) {
            takeOver();
            return;
          }
          if (retryCount() < 2) {
            setRetryCount(retryCount() + 1);
            globalThis.location?.reload();
          }
        }, 2500);
        return;
      }
      if (retryCount() < 3) {
        setRetryCount(retryCount() + 1);
        setTimeout(() => globalThis.location?.reload(), 300);
        return;
      }
      clearPending();
    }
    if (edition === 'custom' && official) {
      if (retryCount() >= 2) return;
      setRetryCount(retryCount() + 1);
      setTimeout(() => globalThis.location?.reload(), 200);
      return;
    }
    setRetryCount(0);
    if (official) return;
    registerOwn();
  };
  const settleOnce = (): void => {
    if (settled) return;
    settled = true;
    settle();
  };
  setTimeout(settleOnce, 1200);
  void readSidebarEdition().then((snapshot) => {
    if (snapshot === undefined) return;
    setRuntimeSidebarEdition(snapshot.edition);
    if (snapshot.edition === 'custom') settleOnce();
  });
}
