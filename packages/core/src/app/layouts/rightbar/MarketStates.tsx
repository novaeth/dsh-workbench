import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Spinner } from '@dsh-workbench/shared';
import styles from '../market/MarketPage.module.css';

export function MarketChecking({ t }: { readonly t: Translate }) {
  return (
    <div className={styles.marketEmpty}>
      <span className={styles.marketChecking}>
        <Spinner size={14} />
        {t('panels.market.checking')}
      </span>
    </div>
  );
}

export function MarketEmpty({ t }: { readonly t: Translate }) {
  return (
    <div className={styles.marketEmpty}>
      <div className={styles.marketEmptyTitle}>{t('panels.market.empty')}</div>
    </div>
  );
}
