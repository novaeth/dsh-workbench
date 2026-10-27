import { createElement as h, useEffect, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { DiscoverSourceRow } from '@/kernel/contract/market-index';
import {
  Button,
  IconChevronDownOutlineRegular,
  IconRefreshOutlineRegular,
  IconSlidersTwoOutlineRegular,
  Menu,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { DiscoverCategories } from './discover-categories';
import { DiscoverSearch } from './discover-search';
import type { DiscoverSort } from './discover-view';
import { sourceLabelsOf } from './discover-view';
import styles from './MarketPage.module.css';

export interface DiscoverToolbarProps {
  readonly t: Translate;
  readonly sources: readonly DiscoverSourceRow[];
  readonly selected: string | null;
  readonly categories: readonly string[];
  readonly labels: readonly string[];
  readonly query: string;
  readonly category: string | null;
  readonly selectedLabels: readonly string[];
  readonly sort: DiscoverSort;
  readonly loading: boolean;
  readonly onQuery: (value: string) => void;
  readonly onCategory: (value: string | null) => void;
  readonly onToggleLabel: (label: string) => void;
  readonly onSort: (sort: DiscoverSort) => void;
  readonly onRefresh: () => void;
  readonly onSelect: (id: string) => void;
  readonly onManage: () => void;
}

const TEXT_DELAY_MS = 250;

export function DiscoverToolbar(props: DiscoverToolbarProps) {
  const { t, onQuery } = props;
  const [text, setText] = useState(props.query);
  const [open, setOpen] = useState<'market' | 'filter' | 'sort' | null>(null);
  const selectedSource = props.sources.find((source) => source.id === props.selected);
  const sourceLabels = sourceLabelsOf(props.sources);
  const market = selectedSource === undefined ? '' : (sourceLabels.get(selectedSource.id) ?? selectedSource.label);
  const sortName = t(
    props.sort === 'default' ? 'panels.discover.sortDefault' : 'panels.discover.sortPublished',
  );

  useEffect(() => {
    if (text === props.query) return undefined;
    const timer = setTimeout(() => onQuery(text), TEXT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, props.query, onQuery]);

  return (
    <div className={styles.discoverBar}>
      <div className={styles.discoverTools}>
        <Menu
          className={styles.discoverMarket}
          open={open === 'market'}
          onClose={() => setOpen(null)}
          portal
          autoFocus
          selectedId={props.selected ?? undefined}
          items={props.sources.map((source) => ({ id: source.id, label: sourceLabels.get(source.id) ?? source.label }))}
          footer={[
            {
              id: 'manage',
              label: t('panels.discover.manageSources'),
              icon: <IconSlidersTwoOutlineRegular size={14} />,
            },
          ]}
          onSelect={(id) => {
            setOpen(null);
            if (id === 'manage') props.onManage();
            else props.onSelect(id);
          }}
          anchor={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={styles.discoverMarketButton}
              aria-haspopup="menu"
              aria-expanded={open === 'market'}
              aria-label={t('panels.discover.marketMenu', { market })}
              onClick={() => setOpen(open === 'market' ? null : 'market')}
            >
              <span className={styles.discoverMarketName}>{market}</span>
              <IconChevronDownOutlineRegular size={12} aria-hidden="true" />
            </Button>
          }
        />
        <DiscoverSearch t={t} value={text} disabled={props.loading} onChange={setText} />
        {props.labels.length === 0 ? null : (
          <Menu
            className={styles.discoverLabels}
            open={open === 'filter'}
            onClose={() => setOpen(null)}
            portal
            autoFocus
            align="end"
            selectedIds={[...props.selectedLabels]}
            items={props.labels.map((label) => ({ id: label, label }))}
            onSelect={props.onToggleLabel}
            anchor={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-haspopup="menu"
                aria-expanded={open === 'filter'}
                icon={<IconSlidersTwoOutlineRegular size={13} />}
                onClick={() => setOpen(open === 'filter' ? null : 'filter')}
              >
                {props.selectedLabels.length === 0
                  ? t('panels.discover.labelsMenu')
                  : t('panels.discover.labelsCount', { count: String(props.selectedLabels.length) })}
              </Button>
            }
          />
        )}
        <Menu
          className={styles.discoverSort}
          open={open === 'sort'}
          onClose={() => setOpen(null)}
          portal
          autoFocus
          align="end"
          selectedId={props.sort}
          items={[
            { id: 'default', label: t('panels.discover.sortDefault') },
            { id: 'published', label: t('panels.discover.sortPublished') },
          ]}
          onSelect={(id) => {
            setOpen(null);
            props.onSort(id as DiscoverSort);
          }}
          anchor={
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-haspopup="menu"
              aria-expanded={open === 'sort'}
              disabled={props.loading}
              onClick={() => setOpen(open === 'sort' ? null : 'sort')}
            >
              {t('panels.discover.sortWith', { label: sortName })}
              <IconChevronDownOutlineRegular size={12} aria-hidden="true" />
            </Button>
          }
        />
        <Tooltip label={t('panels.discover.refresh')} side="bottom" portal delayMs={500} focusDelayMs={500}>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={styles.discoverRefresh}
            aria-label={t('panels.discover.refresh')}
            disabled={props.loading}
            onClick={props.onRefresh}
            icon={props.loading ? <StateDot state="ongoing" /> : <IconRefreshOutlineRegular size={14} />}
          />
        </Tooltip>
      </div>
      <DiscoverCategories
        t={t}
        categories={props.categories}
        category={props.category}
        onCategory={props.onCategory}
      />
    </div>
  );
}
