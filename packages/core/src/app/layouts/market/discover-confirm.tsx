import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { DiscoverEntry, DiscoverVersionRow } from '@/kernel/contract/market-index';
import { Button, IconWarningOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { displayTitleOf, sourceFactsOf } from './discover-view';
import { DiscoverTransport } from './discover-transport';
import { MarketIcon } from './discover-rows';
import { useGitTransport } from './use-git-transport';
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
  readonly onConfirm: (url?: string) => void;
}

export function DiscoverConfirm({ t, locale, choice, onCancel, onConfirm }: DiscoverConfirmProps) {
  if (choice === null) return null;
  return <DiscoverConfirmBody t={t} locale={locale} choice={choice} onCancel={onCancel} onConfirm={onConfirm} />;
}

function factLabel(t: Translate, kind: string): string {
  return t(
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
}

function DiscoverConfirmBody({
  t,
  locale,
  choice,
  onCancel,
  onConfirm,
}: Omit<DiscoverConfirmProps, 'choice'> & { readonly choice: DiscoverChoice }) {
  const git = choice.version.source.type === 'git' ? choice.version.source : null;
  const transport = useGitTransport(git);
  const title = displayTitleOf(choice.entry, locale) || choice.entry.name;
  const facts = sourceFactsOf(choice.entry.name, choice.version).filter(
    (fact) => git === null || fact.kind !== 'repository',
  );
  const ready = git === null || transport.ready;

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
          <Button
            type="button"
            variant="primary"
            autoFocus
            disabled={!ready}
            aria-busy={git !== null && transport.probing}
            onClick={() => onConfirm(transport.chosen ?? undefined)}
          >
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
        {git === null ? null : <DiscoverTransport t={t} transport={transport} />}
        <div className={styles.discoverFacts}>
          {choice.entry.author === undefined ? null : (
            <div className={styles.discoverFactRow}>
              <span className={styles.discoverFactKind}>{t('panels.discover.factAuthor')}</span>
              <span className={styles.discoverFactValue}>{choice.entry.author}</span>
            </div>
          )}
          {facts.map((fact) => (
            <div key={`${fact.kind}:${fact.value}`} className={styles.discoverFactRow}>
              <span className={styles.discoverFactKind}>{factLabel(t, fact.kind)}</span>
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
