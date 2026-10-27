import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { DiscoverEntry, DiscoverVersionRow } from '@/kernel/contract/market-index';
import { Button, IconWarningOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { displayTitleOf, sourceFactsOf } from './discover-view';
import { MarketIcon } from './discover-rows';
import styles from './MarketPage.module.css';

export interface DiscoverChoice {
  readonly entry: DiscoverEntry;
  readonly version: DiscoverVersionRow;
}

export interface DiscoverConfirmProps {
  readonly t: Translate;
  readonly locale: string;
  readonly choice: DiscoverChoice | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function DiscoverConfirm({ t, locale, choice, onCancel, onConfirm }: DiscoverConfirmProps) {
  if (choice === null) return null;
  const title = displayTitleOf(choice.entry, locale) || choice.entry.name;
  const facts = sourceFactsOf(choice.entry.name, choice.version);
  const factLabel = (kind: string): string =>
    t(
      kind === 'package'
        ? 'panels.discover.factPackage'
        : kind === 'registry'
          ? 'panels.discover.factRegistry'
          : kind === 'repository'
            ? 'panels.discover.factRepository'
            : kind === 'commit'
              ? 'panels.discover.factCommit'
              : 'panels.discover.factDirectory',
    );
  return (
    <Modal
      open
      onClose={onCancel}
      title={t('panels.discover.confirmTitle', { name: title })}
      closeLabel={t('panels.discover.close')}
      className={styles.discoverDialog}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('panels.discover.confirmCancel')}
          </Button>
          <Button type="button" variant="primary" autoFocus onClick={onConfirm}>
            {t('panels.discover.cardInstall')}
          </Button>
        </>
      }
    >
      <div className={styles.discoverDialogBody}>
        <div className={styles.discoverConfirmHead}>
          <span className={styles.discoverArtwork} aria-hidden="true">
            <MarketIcon src={choice.entry.icon} />
          </span>
          <div className={styles.discoverMain}>
            <span className={styles.discoverStrong}>{title}</span>
            <span className={styles.discoverMeta}>{choice.version.version}</span>
          </div>
        </div>
        <div className={styles.discoverFacts}>
          {choice.entry.author === undefined ? null : (
            <div className={styles.discoverFactRow}>
              <span className={styles.discoverFactKind}>{t('panels.discover.factAuthor')}</span>
              <span className={styles.discoverFactValue}>{choice.entry.author}</span>
            </div>
          )}
          {facts.map((fact) => (
            <div key={`${fact.kind}:${fact.value}`} className={styles.discoverFactRow}>
              <span className={styles.discoverFactKind}>{factLabel(fact.kind)}</span>
              <span className={styles.discoverFactValue}>
                <code className={styles.discoverCode}>{fact.value}</code>
              </span>
            </div>
          ))}
        </div>
        <p className={styles.discoverNotice} role="note">
          <IconWarningOutlineRegular size={14} aria-hidden="true" />
          <span>{t('panels.discover.installTrust')}</span>
        </p>
      </div>
    </Modal>
  );
}
