import { Fragment, createElement as h, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { marketText } from '@dsh-workbench/shared';
import type { DiscoverEntry, DiscoverVersionRow } from '@/kernel/contract/market-index';
import {
  IconChevronDownOutlineRegular,
  IconWarningOutlineRegular,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { displayTitleOf, latestVersionOf, publishDateText, sourceFactsOf } from './discover-view';
import type { SourceFact } from './discover-view';
import { EntryAction, MarketIcon } from './discover-rows';
import { DiscoverVersions } from './discover-versions';
import { DiscoverDocPanel } from './discover-doc';
import styles from './MarketPage.module.css';

type DetailTab = 'overview' | 'readme' | 'changelog';

interface DetailTabItem {
  readonly value: DetailTab;
  readonly label: string;
  readonly id: string;
  readonly panelId: string;
}

interface DetailTabsProps {
  readonly items: readonly DetailTabItem[];
  readonly value: DetailTab;
  readonly onChange: (tab: DetailTab) => void;
  readonly label: string;
}

function DetailTabs({ items, value, onChange, label }: DetailTabsProps) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = items.length - 1;
    let target: number;
    switch (event.key) {
      case 'ArrowRight':
        target = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
        target = index === 0 ? last : index - 1;
        break;
      case 'Home':
        target = 0;
        break;
      case 'End':
        target = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(items[target].value);
    buttons.current[target]?.focus();
  };
  return (
    <div className={styles.discoverTabStrip} role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.value}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="tab"
          id={item.id}
          aria-controls={item.panelId}
          aria-selected={item.value === value}
          tabIndex={item.value === value ? 0 : -1}
          className={styles.discoverTab}
          onClick={() => onChange(item.value)}
          onKeyDown={(event) => move(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export interface DiscoverDetailProps {
  readonly t: Translate;
  readonly locale: string;
  readonly entry: DiscoverEntry;
  readonly market: string;
  readonly onBack: () => void;
  readonly onInstall: (entry: DiscoverEntry, version: DiscoverVersionRow) => void;
  readonly onShowInstalled: (name: string) => void;
  readonly installDisabled?: boolean;
}

function factLabel(t: Translate, fact: SourceFact): string {
  return t(
    fact.kind === 'package'
      ? 'panels.discover.factPackage'
      : fact.kind === 'registry'
        ? 'panels.discover.factRegistry'
        : fact.kind === 'repository'
          ? 'panels.discover.factRepository'
          : fact.kind === 'commit'
            ? 'panels.discover.factCommit'
            : 'panels.discover.factDirectory',
  );
}

function FactRow({ kind, children }: { readonly kind: string; readonly children: ReturnType<typeof h> | string }) {
  return (
    <div className={styles.discoverFactRow}>
      <span className={styles.discoverFactKind}>{kind}</span>
      <span className={styles.discoverFactValue}>{children}</span>
    </div>
  );
}

interface OverviewPanelProps {
  readonly t: Translate;
  readonly locale: string;
  readonly entry: DiscoverEntry;
  readonly latest: DiscoverVersionRow | undefined;
  readonly market: string;
  readonly onInstall: (entry: DiscoverEntry, version: DiscoverVersionRow) => void;
  readonly installDisabled?: boolean;
}

function OverviewPanel({ t, locale, entry, latest, market, onInstall, installDisabled }: OverviewPanelProps) {
  const description = marketText(entry.description, locale);
  const date = publishDateText(latest?.publishTimestamp, locale, 'long');
  const facts = latest === undefined ? [] : sourceFactsOf(entry.name, latest);
  return (
    <>
      {description === '' ? null : <p className={styles.discoverDetailText}>{description}</p>}
      {latest?.compat === 'incompatible' ? (
        <p className={styles.discoverNotice} role="note">
          <IconWarningOutlineRegular size={14} aria-hidden="true" />
          <span>
            {t('panels.discover.badShellDetail', {
              peer: latest.peer ?? '',
              current: latest.engines?.dsh ?? '',
            })}
          </span>
        </p>
      ) : null}
      <section className={styles.discoverSection}>
        <h4 className={styles.discoverSectionTitle}>{t('panels.discover.detailSource')}</h4>
        <div className={styles.discoverFacts}>
          <FactRow kind={t('panels.discover.factAuthor')}>
            {entry.author === undefined || entry.author === ''
              ? t('panels.discover.authorUnknown')
              : entry.author}
          </FactRow>
          {entry.homepage === undefined ? null : (
            <FactRow kind={t('panels.discover.factHomepage')}>
              <a className={styles.discoverLink} href={entry.homepage} target="_blank" rel="noopener noreferrer">
                {entry.homepage}
              </a>
            </FactRow>
          )}
          {facts.map((fact) => (
            <FactRow key={`${fact.kind}:${fact.value}`} kind={factLabel(t, fact)}>
              <code className={styles.discoverCode}>{fact.value}</code>
            </FactRow>
          ))}
          {latest === undefined ? null : <FactRow kind={t('panels.discover.factPublished')}>{date}</FactRow>}
          {entry.category === undefined ? null : (
            <FactRow kind={t('panels.discover.factCategory')}>{entry.category}</FactRow>
          )}
          {entry.labels.length === 0 ? null : (
            <FactRow kind={t('panels.discover.factLabels')}>
              <span className={styles.discoverTags}>
                {entry.labels.map((label) => (
                  <Tag key={label}>{label}</Tag>
                ))}
              </span>
            </FactRow>
          )}
          <FactRow kind={t('panels.discover.factMarket')}>{market}</FactRow>
        </div>
      </section>
      {latest === undefined ? null : (
        <section className={styles.discoverSection}>
          <h4 className={styles.discoverSectionTitle}>{t('panels.discover.detailVersions')}</h4>
          <DiscoverVersions
            t={t}
            locale={locale}
            entry={entry}
            onInstall={onInstall}
            installDisabled={installDisabled === true}
          />
        </section>
      )}
    </>
  );
}

export function DiscoverDetail(props: DiscoverDetailProps) {
  const { t, locale, entry } = props;
  const [tab, setTab] = useState<DetailTab>('overview');
  const title = displayTitleOf(entry, locale);
  const latest = latestVersionOf(entry);
  const idPrefix = `market-detail-${entry.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const tabItems = useMemo(
    () =>
      [
        {
          value: 'overview' as const,
          label: t('panels.discover.tabOverview'),
          id: `${idPrefix}-tab-overview`,
          panelId: `${idPrefix}-panel-overview`,
        },
        {
          value: 'readme' as const,
          label: t('panels.discover.tabReadme'),
          id: `${idPrefix}-tab-readme`,
          panelId: `${idPrefix}-panel-readme`,
        },
        {
          value: 'changelog' as const,
          label: t('panels.discover.tabChangelog'),
          id: `${idPrefix}-tab-changelog`,
          panelId: `${idPrefix}-panel-changelog`,
        },
      ] as const,
    [idPrefix, t],
  );
  return (
    <div className={styles.discoverDetail} data-market-detail={entry.name}>
      <button type="button" className={styles.discoverCrumb} onClick={props.onBack}>
        <IconChevronDownOutlineRegular className={styles.discoverCrumbIcon} aria-hidden="true" />
        <span>{t('panels.discover.detailBack')}</span>
      </button>
      <div className={styles.discoverDetailHead}>
        <span className={styles.discoverArtwork} aria-hidden="true">
          <MarketIcon src={entry.icon} />
        </span>
        <div className={styles.discoverMain}>
          <div className={styles.discoverTitleRow}>
            <h3 className={styles.discoverDetailTitle}>{title}</h3>
            {latest === undefined ? null : <Tag tone="neutral">{latest.version}</Tag>}
          </div>
          {title === entry.name ? null : <span className={styles.discoverMeta}>{entry.name}</span>}
        </div>
        {latest === undefined ? null : (
          <EntryAction
            t={t}
            entry={entry}
            title={title}
            onInstall={props.onInstall}
            onShowInstalled={props.onShowInstalled}
            installDisabled={props.installDisabled === true}
          />
        )}
      </div>
      <DetailTabs items={tabItems} value={tab} onChange={setTab} label={t('panels.discover.detailTabs')} />
      {tab === 'overview' ? (
        <div
          className={styles.discoverDetailPanel}
          id={`${idPrefix}-panel-overview`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-overview`}
        >
          <OverviewPanel
            t={t}
            locale={locale}
            entry={entry}
            latest={latest}
            market={props.market}
            onInstall={props.onInstall}
            installDisabled={props.installDisabled === true}
          />
        </div>
      ) : null}
      {tab === 'overview' || latest === undefined ? null : (
        <div
          className={styles.discoverDetailPanel}
          id={`${idPrefix}-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-${tab}`}
        >
          <DiscoverDocPanel
            key={`${latest.version}:${tab}`}
            t={t}
            name={entry.name}
            version={latest.version}
            kind={tab}
          />
        </div>
      )}
    </div>
  );
}
