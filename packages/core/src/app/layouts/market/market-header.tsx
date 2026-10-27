import { Fragment, createElement as h, useMemo } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, IconPlusOutlineRegular, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './MarketPage.module.css';

export type MarketTab = 'installed' | 'discover';

export interface MarketHeaderProps {
  readonly t: Translate;
  readonly idPrefix: string;
  readonly tab: MarketTab;
  readonly busy: boolean;
  readonly onTab: (tab: MarketTab) => void;
  readonly onAdd: () => void;
}

export function MarketHeader({ t, idPrefix, tab, busy, onTab, onAdd }: MarketHeaderProps) {
  const tabItems = useMemo(
    () =>
      [
        {
          value: 'installed' as const,
          label: t('panels.market.tabInstalled'),
          id: `${idPrefix}-tab-installed`,
          panelId: `${idPrefix}-panel-installed`,
        },
        {
          value: 'discover' as const,
          label: t('panels.tab.discover'),
          id: `${idPrefix}-tab-discover`,
          panelId: `${idPrefix}-panel-discover`,
        },
      ] as const,
    [idPrefix, t],
  );

  return (
    <>
      <header className={styles.marketPageHead}>
        <div>
          <h1 className={styles.marketPageTitle}>{t('panels.tab.market')}</h1>
          <p className={styles.marketPageIntro}>{t('panels.market.lead')}</p>
        </div>
        <div className={styles.marketPageTools}>
          {tab !== 'installed' ? null : (
            <Button
              variant="primary"
              size="sm"
              className={styles.marketAddButton}
              icon={<IconPlusOutlineRegular size={13} />}
              disabled={busy}
              onClick={onAdd}
            >
              {t('panels.market.add.open')}
            </Button>
          )}
        </div>
      </header>
      <div className={styles.marketTabs}>
        <SegmentedTabs
          className={styles.marketTabList}
          items={tabItems}
          value={tab}
          onChange={onTab}
          label={t('panels.market.tabs')}
        />
      </div>
    </>
  );
}
