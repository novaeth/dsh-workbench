import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { TextField } from '@dsh-workbench/shared';
import { Button, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { GitTransportState, TransportProbe } from './use-git-transport';
import styles from './MarketPage.module.css';

function stateText(t: Translate, state: TransportProbe): string {
  if (state === 'ok') return '';
  if (state === 'auth') return t('panels.discover.transportAuth');
  if (state === 'unreachable') return t('panels.discover.transportUnreachable');
  if (state === 'unknown') return t('panels.discover.transportUnknown');
  return t('panels.discover.transportChecking');
}

function kindText(t: Translate, kind: 'https' | 'ssh'): string {
  return t(kind === 'ssh' ? 'panels.discover.transportSsh' : 'panels.discover.transportHttps');
}

export interface DiscoverTransportProps {
  readonly t: Translate;
  readonly transport: GitTransportState;
}

export function DiscoverTransport({ t, transport }: DiscoverTransportProps) {
  const [open, setOpen] = useState(false);
  const chosenRow = transport.rows.find((row) => row.url === transport.chosen);
  const chosenState = chosenRow === undefined ? undefined : (transport.states[chosenRow.url] ?? 'checking');
  const probing = transport.probing;
  const summary =
    chosenRow !== undefined
      ? kindText(t, chosenRow.kind)
      : probing
        ? t('panels.discover.transportChecking')
        : t('panels.discover.transportNone');
  const summaryState = probing || chosenState === undefined ? '' : stateText(t, chosenState);
  const needsAuth =
    transport.rows.length > 0 &&
    transport.rows.every((row) => transport.states[row.url] === 'auth') &&
    transport.customState !== 'ok';
  const customBusy = transport.customState === 'checking';

  return (
    <div className={styles.discoverTransport}>
      <div className={styles.discoverTransportHead}>
        <span className={styles.discoverTransportTitle}>{t('panels.discover.transportTitle')}</span>
        <span className={styles.discoverTransportKind}>{summary}</span>
        {summaryState === '' ? null : (
          <span className={styles.discoverTransportState}>{summaryState}</span>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
          {t(open ? 'panels.discover.transportChangeHide' : 'panels.discover.transportChange')}
        </Button>
      </div>

      {open ? (
        <div
          className={styles.discoverTransportRows}
          role="radiogroup"
          aria-label={t('panels.discover.transportTitle')}
        >
          {transport.rows.map((row) => {
            const state = transport.states[row.url] ?? 'checking';
            const label = stateText(t, state);
            return (
              <label key={row.url} className={styles.discoverTransportRow} data-state={state} title={row.url}>
                <input
                  type="radio"
                  className={styles.discoverTransportRadio}
                  name="discover-git-transport"
                  value={row.url}
                  checked={transport.chosen === row.url}
                  onChange={() => transport.setChosen(row.url)}
                />
                <span className={styles.discoverTransportKind}>{kindText(t, row.kind)}</span>
                {label === '' ? null : <span className={styles.discoverTransportState}>{label}</span>}
              </label>
            );
          })}
        </div>
      ) : null}

      {open ? (
        <div className={styles.discoverTransportCustom}>
          <TextField
            type="text"
            className={styles.discoverTransportInput}
            value={transport.custom}
            placeholder={t('panels.discover.transportPlaceholder')}
            aria-label={t('panels.discover.transportPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => transport.setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') transport.checkCustom();
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={transport.custom.trim() === '' || customBusy}
            aria-busy={customBusy}
            onClick={transport.checkCustom}
          >
            {t(customBusy ? 'panels.discover.transportChecking' : 'panels.discover.transportTest')}
          </Button>
          {transport.customState === null || stateText(t, transport.customState) === '' ? null : (
            <span className={styles.discoverTransportState}>{stateText(t, transport.customState)}</span>
          )}
        </div>
      ) : null}

      {needsAuth ? (
        <p className={styles.discoverNotice} role="note">
          <IconWarningOutlineRegular size={14} aria-hidden="true" />
          <span>{t('panels.discover.transportNeedsAuth')}</span>
        </p>
      ) : null}
    </div>
  );
}
