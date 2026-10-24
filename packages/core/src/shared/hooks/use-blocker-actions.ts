import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlockerAction } from '@dsh-workbench/shared';

import { useHostWrite } from './use-host-write';
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';

export interface BlockerActions {
  run(action: BlockerAction): void;
  copied: string | null;
  running: string | null;
  failure: { message: string; detail?: string } | null;
}

export function useBlockerActions(onRetry: () => void, onOpenMarket?: () => void): BlockerActions {
  const [copied, setCopied] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(null);
  const retryRef = useRef(onRetry);
  const marketRef = useRef(onOpenMarket);
  useEffect(() => {
    retryRef.current = onRetry;
    marketRef.current = onOpenMarket;
  }, [onRetry, onOpenMarket]);
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
      void writeClipboard(action.text).then((ok) => {
        if (!ok) return;
        setCopied(action.text);
        setTimeout(() => setCopied(null), 1500);
      });
      return;
    }
    window.open(action.url, '_blank', 'noopener');
  }, [provision]);

  return { run, copied, running, failure };
}
