import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { DiscoverDetail } from './discover-detail';
import { DiscoverDialogs } from './discover-dialogs';
import { DiscoverRows } from './discover-rows';
import { DiscoverToolbar } from './discover-toolbar';
import {
  DiscoverEmptyText,
  DiscoverFailure,
  DiscoverLoading,
  DiscoverNoSource,
  DiscoverSkeleton,
  DiscoverUninitialized,
} from './discover-states';
import { useDiscover } from './use-discover';
import { sourceLabelsOf, unfiltered } from './discover-view';
import styles from './MarketPage.module.css';

export interface DiscoverPanelProps {
  readonly t: Translate;
  readonly active: boolean;
  readonly onInstalled: () => void;
  readonly onShowInstalled: (name: string) => void;
}

export function DiscoverPanel({ t, active, onInstalled, onShowInstalled }: DiscoverPanelProps) {
  const d = useDiscover(t, active, onInstalled);
  const marketLabel =
    d.selected === null ? '' : (sourceLabelsOf(d.sources).get(d.selected) ?? '');

  const toolbar = (
    <DiscoverToolbar
      key={d.selected ?? 'none'}
      t={t}
      sources={d.sources}
      selected={d.selected}
      categories={d.categories}
      labels={d.labels}
      query={d.query}
      category={d.category}
      selectedLabels={d.selectedLabels}
      sort={d.sort}
      loading={d.loading}
      onQuery={d.setQuery}
      onCategory={d.setCategory}
      onToggleLabel={d.toggleLabel}
      onSort={d.setSort}
      onRefresh={d.reload}
      onSelect={d.selectSource}
      onManage={() => d.setManageOpen(true)}
    />
  );

  const dialogs = <DiscoverDialogs t={t} d={d} />;
  const slowHint =
    !d.manageOpen && d.loading && d.slow ? (
      <p className={styles.discoverNotice} role="note">
        <IconWarningOutlineRegular size={14} aria-hidden="true" />
        <span>{t('panels.discover.slowHint')}</span>
      </p>
    ) : null;

  if (d.payload === null) {
    return (
      <div className={styles.discoverPage}>
        {d.sources.length === 0 ? null : toolbar}
        {d.loading ? (
          <DiscoverSkeleton label={t('panels.discover.loading')} />
        ) : (
          <DiscoverFailure t={t} text={t('panels.discover.sourcesFailed')} onRetry={d.reload} />
        )}
        {slowHint}
        {d.writeFailed === null ? null : <p className={styles.discoverError}>{d.writeFailed}</p>}
        {dialogs}
      </div>
    );
  }

  if (d.payload.state === 'no-source') {
    return (
      <div className={styles.discoverPage}>
        <DiscoverNoSource t={t} onAdd={() => d.setManageOpen(true)} />
        {dialogs}
      </div>
    );
  }

  const failed = d.payload.state === 'invalid' || d.payload.state === 'unreadable';
  const readFailed =
    !d.loading && failed
      ? d.payload.state === 'invalid'
        ? t('panels.discover.invalid')
        : t('panels.discover.unreadable')
      : null;
  const uninitialized = d.loading ? null : d.uninitialized;
  const retrying = d.loading && failed;
  const emptyText = unfiltered({ query: d.query, category: d.category, labels: d.selectedLabels })
    ? t('panels.discover.empty')
    : t('panels.discover.noMatch');

  return (
    <div className={styles.discoverPage}>
      {toolbar}
      {d.loading && !d.manageOpen ? <DiscoverLoading label={t('panels.discover.loading')} /> : null}
      {slowHint}
      {!d.loading && d.payload.stale === true ? (
        <p className={styles.discoverNotice} role="note">
          <IconWarningOutlineRegular size={14} aria-hidden="true" />
          <span>{t('panels.discover.stale')}</span>
        </p>
      ) : null}
      {uninitialized === null ? (
        readFailed === null ? null : <DiscoverFailure t={t} text={readFailed} onRetry={d.reload} />
      ) : (
        <DiscoverUninitialized
          t={t}
          path={uninitialized.path}
          empty={uninitialized.empty}
          onInit={() => d.setInitOpen(true)}
        />
      )}
      {d.notice === null ? null : (
        <p className={styles.discoverNotice} role="note">
          <IconWarningOutlineRegular size={14} aria-hidden="true" />
          <span>{d.notice}</span>
        </p>
      )}
      {d.writeFailed === null ? null : <p className={styles.discoverError}>{d.writeFailed}</p>}
      {d.provisionFailed === null ? null : <p className={styles.discoverError}>{d.provisionFailed}</p>}
      {d.detailEntry !== null ? (
        <DiscoverDetail
          t={t}
          locale={d.locale}
          entry={d.detailEntry}
          market={marketLabel}
          onBack={d.closeDetail}
          onInstall={(entry, version) => d.setChoice({ entry, version })}
          onShowInstalled={onShowInstalled}
        />
      ) : readFailed !== null || uninitialized !== null || retrying ? null : d.shown.length === 0 ? (
        <DiscoverEmptyText text={emptyText} />
      ) : (
        <DiscoverRows
          t={t}
          locale={d.locale}
          entries={d.shown}
          onOpen={d.openDetail}
          onInstall={(entry, version) => d.setChoice({ entry, version })}
          onShowInstalled={onShowInstalled}
        />
      )}
      {d.detailEntry !== null || d.total <= d.shown.length ? null : (
        <Button type="button" variant="outline" size="sm" className={styles.discoverMore} onClick={d.showMore}>
          {t('panels.discover.showMore')}
        </Button>
      )}
      {dialogs}
    </div>
  );
}
