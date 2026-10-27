import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { DiscoverSkeleton } from '../market/discover-states';
import styles from '../market/MarketPage.module.css';

export function MarketChecking({ t }: { readonly t: Translate }) {
  return <DiscoverSkeleton label={t('panels.market.checking')} />;
}

export function MarketEmpty({ t }: { readonly t: Translate }) {
  return (
    <div className={styles.marketEmpty}>
      <div className={styles.marketEmptyTitle}>{t('panels.market.empty')}</div>
    </div>
  );
}
