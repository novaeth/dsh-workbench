import { createElement as h, useRef } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import {
  Button,
  IconCloseOutlineRegular,
  IconSearchOutlineRegular,
  Input,
} from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './MarketPage.module.css';

export interface DiscoverSearchProps {
  readonly t: Translate;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}

export function DiscoverSearch({ t, value, disabled, onChange }: DiscoverSearchProps) {
  const field = useRef<HTMLInputElement>(null);
  return (
    <span className={styles.discoverSearch}>
      <Input
        ref={field}
        className={
          value === ''
            ? styles.discoverSearchField
            : `${styles.discoverSearchField} ${styles.discoverSearchFieldFilled}`
        }
        type="search"
        icon={<IconSearchOutlineRegular size={14} />}
        value={value}
        placeholder={t('panels.discover.search')}
        aria-label={t('panels.discover.search')}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {value === '' ? null : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={styles.discoverSearchClear}
          aria-label={t('panels.discover.clearSearch')}
          disabled={disabled}
          icon={<IconCloseOutlineRegular size={14} />}
          onClick={() => {
            onChange('');
            field.current?.focus();
          }}
        />
      )}
    </span>
  );
}
