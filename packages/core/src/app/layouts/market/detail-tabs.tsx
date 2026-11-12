import { createElement as h } from 'react';
import type { KeyboardEvent } from 'react';
import styles from './MarketPage.module.css';

export type DetailTab = 'overview' | 'readme' | 'changelog';

export interface DetailTabItem {
  readonly value: DetailTab;
  readonly label: string;
  readonly id: string;
  readonly panelId: string;
}

export interface DetailTabLabels {
  readonly overview: string;
  readonly readme: string;
  readonly changelog: string;
}

export interface DetailTabsProps {
  readonly items: readonly DetailTabItem[];
  readonly value: DetailTab;
  readonly onChange: (tab: DetailTab) => void;
  readonly label: string;
}

export function detailTabItems(idPrefix: string, labels: DetailTabLabels): readonly DetailTabItem[] {
  return [
    {
      value: 'overview',
      label: labels.overview,
      id: `${idPrefix}-tab-overview`,
      panelId: `${idPrefix}-panel-overview`,
    },
    {
      value: 'readme',
      label: labels.readme,
      id: `${idPrefix}-tab-readme`,
      panelId: `${idPrefix}-panel-readme`,
    },
    {
      value: 'changelog',
      label: labels.changelog,
      id: `${idPrefix}-tab-changelog`,
      panelId: `${idPrefix}-panel-changelog`,
    },
  ];
}

export function DetailTabs({ items, value, onChange, label }: DetailTabsProps) {
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
    const buttons = event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[target]?.focus();
  };
  return (
    <div className={styles.discoverTabStrip} role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.value}
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
