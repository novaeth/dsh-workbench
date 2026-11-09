import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlockerAction } from '@dsh-workbench/shared';

import { useHostWrite } from './use-host-write';
import { useExternalActions } from './use-external-actions';

export interface BlockerActions {
  run(action: BlockerAction): void;
  copied: string | null;
  running: string | null;
  failure: { message: string; detail?: string } | null;
}

export function useBlockerActions(onRetry: () => void, onOpenMarket?: () => void): BlockerActions {
  const [running, setRunning] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const retryRef = useRef(onRetry);
  const marketRef = useRef(onOpenMarket);
  useEffect(() => {
    retryRef.current = onRetry;
    marketRef.current = onOpenMarket;
  }, [onRetry, onOpenMarket]);
  const external = useExternalActions(() => retryRef.current());
  const { open, copy } = external;
  const provision = useHostWrite({
    channel: 'provision',
    networkText: '网络不通',
  });

  const run = useCallback((action: BlockerAction): void => {
    if (action.kind === 'retry') {
      retryRef.current();
      return;
    }
    if (action.kind === 'open-market') {
      if (marketRef.current === undefined) retryRef.current();
      else marketRef.current();
      return;
    }
    if (action.kind === 'run-fix') {
      setFailure(null);
      setRunning(action.label);
      void provision
        .send({
          action: action.fix,
          unit: action.unit,
        })
        .then((outcome) => {
          if (outcome.ok) {
            retryRef.current();
            setRunning(null);
            return;
          }
          setFailure({
            message: outcome.message,
            ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
          });
          setRunning(null);
        });
      return;
    }
    if (action.kind === 'copy') {
      copy(action.text);
      return;
    }
    open(action.url);
  }, [provision, copy, open]);

  return { run, copied: external.copied, running, failure };
}
