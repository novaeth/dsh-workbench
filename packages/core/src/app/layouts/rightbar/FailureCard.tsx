import { createElement as h, useCallback, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, StateDot, TerminalBlock, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import type { TerminalBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import type { FailureCardExtras, FailureCardModel } from './failure-card-text';
import styles from './FailureCard.module.css';

const COPIED_MS = 1200;

function terminalLabels(t: Translate): TerminalBlockLabels {
  return {
    commandLine: (line) => t('panels.market.failure.term.commandLine', { line }),
    signal: (signal) => t('panels.market.failure.term.signal', { signal }),
    exitCode: (exitCode) => t('panels.market.failure.term.exitCode', { exitCode }),
    noExitCode: t('panels.market.failure.term.noExitCode'),
    running: t('panels.market.failure.term.running'),
    failed: t('panels.market.failure.term.failed'),
    done: t('panels.market.failure.term.done'),
    copy: t('panels.market.failure.term.copy'),
    copied: t('panels.market.failure.term.copied'),
    noOutput: t('panels.market.failure.term.noOutput'),
    collapseAria: t('panels.market.failure.term.collapse'),
    collapse: t('panels.market.failure.term.collapse'),
    expandAria: (hidden) => t('panels.market.failure.term.expandAria', { hidden }),
    expand: (hidden) => t('panels.market.failure.term.expand', { hidden }),
  };
}

export function FailureCard({
  t,
  model,
  extras,
  onRecheck,
  rechecking,
}: {
  readonly t: Translate;
  readonly model: FailureCardModel;
  readonly extras?: FailureCardExtras | undefined;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}) {
  const hasOutput = model.command !== '' || model.output !== '';
  const [copied, setCopied] = useState<'fix' | 'agent' | null>(null);
  const [open, setOpen] = useState(false);

  const onCopy = useCallback((kind: 'fix' | 'agent', text: string) => {
    void writeClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(kind);
      setTimeout(() => setCopied(null), COPIED_MS);
    });
  }, []);

  const fix = model.fix;
  const askAgent = extras?.askAgent ?? '';
  const showOutputLabel = extras?.outputLabel ?? t('panels.market.failure.showOutput');
  const hideOutputLabel = extras?.hideOutputLabel ?? t('panels.market.failure.hideOutput');
  const retry = (
    <Button type="button" size="sm" variant="ghost" disabled={rechecking} onClick={onRecheck}>
      {extras?.actionLabel ?? t('panels.market.failure.recheck')}
    </Button>
  );

  return (
    <div className={styles.block}>
      {model.title === undefined ? null : (
        <div className={styles.head}>
          <StateDot state="error" size={8} />
          <span className={styles.title}>{model.title}</span>
        </div>
      )}
      {model.fact === '' ? null : (
        <p className={model.tone === 'alert' ? styles.factAlert : styles.fact}>{model.fact}</p>
      )}
      <div className={styles.actions}>
        {extras?.actionFirst === true ? retry : null}
        {fix === '' ? null : (
          <Button type="button" size="sm" variant="ghost" onClick={() => onCopy('fix', fix)}>
            {copied === 'fix' ? t('panels.market.failure.copied') : model.fixLabel}
          </Button>
        )}
        {extras?.actionFirst === true ? null : retry}
        {askAgent === '' ? null : (
          <Button type="button" size="sm" variant="ghost" onClick={() => onCopy('agent', askAgent)}>
            {copied === 'agent' ? t('askAgent.copied') : t('askAgent.copy')}
          </Button>
        )}
        {hasOutput ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(!open)}>
            {open ? hideOutputLabel : showOutputLabel}
          </Button>
        ) : null}
      </div>
      {copied === 'fix' && model.copiedHint !== undefined ? <p className={styles.hint}>{model.copiedHint}</p> : null}
      {extras?.showCommand === true && model.command !== '' ? (
        <pre className={styles.command}>{model.command}</pre>
      ) : null}
      {open && hasOutput ? (
        <TerminalBlock
          command={model.command}
          output={model.output}
          exitCode={model.exitCode}
          maxLines={8}
          labels={terminalLabels(t)}
          className={styles.output}
        />
      ) : null}
    </div>
  );
}
