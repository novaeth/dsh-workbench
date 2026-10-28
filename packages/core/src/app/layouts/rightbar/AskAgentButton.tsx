import { createElement as h, useCallback, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';

const COPIED_MS = 1200;

export function AskAgentButton({
  t,
  text,
  label,
}: {
  readonly t: Translate;
  readonly text: string;
  readonly label: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    void writeClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    });
  }, [text]);

  return (
    <Button type="button" size="sm" variant="ghost" onClick={onCopy}>
      {copied ? t('panels.market.askAgentCopied') : label}
    </Button>
  );
}
