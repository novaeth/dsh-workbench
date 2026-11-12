import { createElement as h } from 'react';
import type { ReactNode, Translate } from '@dsh-workbench/shared';
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from '../market/MarketPage.module.css';

export interface MarketDetailTopProps {
  readonly t: Translate;
  readonly onBack: () => void;
  readonly icon: ReactNode;
  readonly children: ReactNode;
  readonly end?: ReactNode;
}

export function MarketDetailTop({ t, onBack, icon, children, end }: MarketDetailTopProps) {
  return (
    <div className={styles.discoverDetailTop}>
      <button type="button" className={styles.discoverCrumb} onClick={onBack}>
        <IconChevronDownOutlineRegular className={styles.discoverCrumbIcon} aria-hidden="true" />
        <span>{t('panels.market.detailBack')}</span>
      </button>
      <div className={`${styles.discoverDetailHead} ${styles.marketDetailHead}`}>
        <span className={styles.discoverArtwork} aria-hidden="true">
          {icon}
        </span>
        {children}
        {end}
      </div>
    </div>
  );
}
