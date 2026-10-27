import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Pill } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './MarketPage.module.css';

export interface DiscoverCategoriesProps {
  readonly t: Translate;
  readonly categories: readonly string[];
  readonly category: string | null;
  readonly onCategory: (value: string | null) => void;
}

export function DiscoverCategories({ t, categories, category, onCategory }: DiscoverCategoriesProps) {
  if (categories.length === 0) return null;
  return (
    <div className={styles.discoverChips} role="group" aria-label={t('panels.discover.categoriesLabel')}>
      <Pill active={category === null} aria-pressed={category === null} onClick={() => onCategory(null)}>
        {t('panels.discover.all')}
      </Pill>
      {categories.map((item) => (
        <Pill
          key={item}
          active={category === item}
          aria-pressed={category === item}
          onClick={() => onCategory(item)}
        >
          {item}
        </Pill>
      ))}
    </div>
  );
}
