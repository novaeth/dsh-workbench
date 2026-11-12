import { createElement as h } from 'react';
import type { ReactNode, Translate } from '@dsh-workbench/shared';
import { MarketDetailTop } from './market-detail-top';
import { DiscoverDocPanel } from '../market/discover-doc';
import { DetailTabs, detailTabItems, type DetailTab } from '../market/detail-tabs';
import styles from '../market/MarketPage.module.css';

export function installedDetailTabs({
  t,
  idPrefix,
  value,
  onChange,
  labelKey = 'panels.market.detailTabs',
}: {
  readonly t: Translate;
  readonly idPrefix: string;
  readonly value: DetailTab;
  readonly onChange: (tab: DetailTab) => void;
  readonly labelKey?: string | undefined;
}): JSX.Element {
  return (
    <DetailTabs
      items={detailTabItems(idPrefix, {
        overview: t('panels.market.detailTabOverview'),
        readme: t('panels.market.detailTabReadme'),
        changelog: t('panels.market.detailTabChangelog'),
      })}
      value={value}
      onChange={onChange}
      label={t(labelKey)}
    />
  );
}

export function installedDetailTop({
  t,
  onBack,
  icon,
  end,
  tabs,
  children,
}: {
  readonly t: Translate;
  readonly onBack: () => void;
  readonly icon: ReactNode;
  readonly end: ReactNode;
  readonly tabs: ReactNode;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <MarketDetailTop t={t} onBack={onBack} icon={icon} end={end} tabs={tabs}>
      {children}
    </MarketDetailTop>
  );
}

export function installedDetailPanel({
  t,
  idPrefix,
  tab,
  pkg,
  version,
  children,
}: {
  readonly t: Translate;
  readonly idPrefix: string;
  readonly tab: DetailTab;
  readonly pkg: string | undefined;
  readonly version: string | undefined;
  readonly children: ReactNode;
}): JSX.Element {
  if (tab === 'overview') {
    return (
      <div
        className={styles.discoverDetailPanel}
        id={`${idPrefix}-panel-overview`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-overview`}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={styles.discoverDetailPanel}
      id={`${idPrefix}-panel-${tab}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${tab}`}
    >
      {pkg === undefined || version === undefined ? (
        <p className={styles.discoverDocNotice}>
          {t('panels.discover.docMissing', {
            kind: t(tab === 'readme' ? 'panels.discover.docReadme' : 'panels.discover.docChangelog'),
          })}
        </p>
      ) : (
        <DiscoverDocPanel key={`${pkg}:${version}:${tab}`} t={t} name={pkg} version={version} kind={tab} />
      )}
    </div>
  );
}

export function installedDescription(info: { readonly description?: string } | null | undefined): JSX.Element | null {
  if (info?.description === undefined || info.description.trim() === '') return null;
  return <p className={styles.discoverDetailText}>{info.description}</p>;
}
