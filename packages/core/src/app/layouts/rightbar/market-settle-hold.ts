import { useEffect, useRef, useState } from 'react';
import { readText, writeText, type Translate } from '@dsh-workbench/shared';
import type { WorkbenchSelfUpdate } from '@/kernel/contract/bundle-install';

import type { MarketFailure } from './market-row-types';
import { REMOVAL_ACTIONS, WORKBENCH_SWAP_POLL_MS, holdWindowMs, selfUpdateNote, selfUpdateStop } from './market-settle';
import type { Pending } from './market-view-text';

const TOLD_KEY = 'dsh-workbench.market.selfUpdate.told';

export function useSelfUpdateTold(
  update: WorkbenchSelfUpdate | null | undefined,
  mark = false,
): string | undefined {
  const [seen] = useState<string | undefined>(() => readText(TOLD_KEY) ?? undefined);
  const marked = useRef<string | undefined>(seen);
  useEffect(() => {
    if (!mark) return;
    const at = update?.at;
    if (at === undefined || at === '') return;
    if (marked.current !== undefined && at <= marked.current) return;
    marked.current = at;
    writeText(TOLD_KEY, at);
  }, [mark, update?.at]);
  return seen;
}

export function useSettleHold(input: {
  readonly pending: Pending | null;
  readonly landed: boolean;
  readonly t: Translate;
  readonly onChanged: () => void;
  readonly selfUpdate?: WorkbenchSelfUpdate | null | undefined;
  readonly setPending: (next: Pending | null) => void;
  readonly setFailed: (next: MarketFailure | null) => void;
}): void {
  const { pending, landed, t, onChanged, selfUpdate, setPending, setFailed } = input;
  const until = pending?.until;
  const id = pending?.id ?? '';
  const watching = pending !== null && (pending.until !== undefined || pending.readBack === true);
  const slowKey =
    pending !== null && REMOVAL_ACTIONS.has(pending.action)
      ? 'panels.market.removeSlow'
      : 'panels.market.swapSlow';
  const sinceRef = useRef(0);
  const stopRef = useRef('');
  const stop = selfUpdateStop({ until, since: pending?.since, update: selfUpdate });
  const stopKind = stop?.kind;
  const stopCause = stop?.cause;
  const stopFix = stop?.fix;
  const stopVersion = stop?.version;

  useEffect(() => {
    if (!watching || !landed) return;
    setPending(null);
  }, [watching, landed, setPending]);

  useEffect(() => {
    if (stopKind === undefined) return;
    const key = `${stopKind}:${stopCause ?? ''}:${stopFix ?? ''}:${stopVersion ?? ''}:${id}`;
    if (stopRef.current === key) return;
    stopRef.current = key;
    setPending(null);
    const note = selfUpdateNote({
      kind: stopKind,
      ...(stopCause === undefined ? {} : { cause: stopCause }),
      ...(stopFix === undefined ? {} : { fix: stopFix }),
      ...(stopVersion === undefined ? {} : { version: stopVersion }),
    });
    if (note === undefined) return;
    setFailed({ id, message: t(note.key, note.params) });
  }, [stopKind, stopCause, stopFix, stopVersion, id, setPending, setFailed, t]);

  useEffect(() => {
    if (!watching) {
      sinceRef.current = 0;
      return undefined;
    }
    if (sinceRef.current === 0) sinceRef.current = Date.now();
    const deadline = sinceRef.current + holdWindowMs(until);
    const tick = window.setInterval(() => {
      onChanged();
      if (Date.now() < deadline) return;
      window.clearInterval(tick);
      setPending(null);
      setFailed({ id, message: t(slowKey) });
    }, WORKBENCH_SWAP_POLL_MS);
    return () => window.clearInterval(tick);
  }, [watching, landed, until, id, onChanged, setPending, setFailed, t, slowKey]);
}
