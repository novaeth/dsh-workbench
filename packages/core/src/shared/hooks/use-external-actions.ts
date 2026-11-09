import { useCallback, useEffect, useRef, useState } from 'react';
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';

import { watchLoginReturn } from './login-return';

export interface ExternalActions {
  readonly copied: string | null;
  readonly open: (url: string) => void;
  readonly copy: (text: string) => void;
}

export function useExternalActions(onReturn: () => void): ExternalActions {
  const [copied, setCopied] = useState<string | null>(null);
  const returnRef = useRef(onReturn);
  const watch = useRef<(() => void) | null>(null);
  useEffect(() => {
    returnRef.current = onReturn;
  }, [onReturn]);
  useEffect(
    () => () => {
      watch.current?.();
      watch.current = null;
    },
    [],
  );
  const open = useCallback((url: string): void => {
    watch.current?.();
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    watch.current = watchLoginReturn({ onRetry: () => returnRef.current() });
  }, []);
  const copy = useCallback((text: string): void => {
    void writeClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    });
  }, []);
  return { copied, open, copy };
}
