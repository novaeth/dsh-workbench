import { createElement as h, useCallback, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, StateDot, TerminalBlock, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import type { TerminalBlockLabels } from '@deepseek-ai/dsh-client-ui-primitives';
import type { FailureCardModel } from './failure-card-text';
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
  onRecheck,
  rechecking,
}: {
  readonly t: Translate;
  readonly model: FailureCardModel;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
}) {
  const hasOutput = model.command !== '' || model.output !== '';
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const onCopy = useCallback(() => {
    void writeClipboard(model.fix).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    });
  }, [model.fix]);

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <StateDot state="error" size={8} />
        <span className={styles.title}>{model.title}</span>
      </div>
      <p className={styles.fact}>{model.fact}</p>
      <div className={styles.actions}>
        <Button type="button" size="sm" variant="ghost" onClick={onCopy}>
          {copied ? t('panels.market.failure.copied') : model.fixLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={rechecking} onClick={onRecheck}>
          {t('panels.market.failure.recheck')}
        </Button>
        {hasOutput ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(!open)}>
            {open ? t('panels.market.failure.hideOutput') : t('panels.market.failure.showOutput')}
          </Button>
        ) : null}
      </div>
      {copied ? <p className={styles.hint}>{model.copiedHint}</p> : null}
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
