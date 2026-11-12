import { createElement as h, useState } from 'react';
import type {
  CodeToolbarLabels,
  DiffBlockLabels,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from '@dsh-workbench/shared';
import {
  Button,
  Checkbox,
  CodeBlock,
  DiffBlock,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { ConfigSyncRow } from '@/kernel/contract/config-sync';
import styles from './ConfigSyncRows.module.css';

const DIFF_MAX_LINES = 9;

const TAG_KEYS: Readonly<Record<string, string>> = {
  new: 'configSync.tag.new',
  differs: 'configSync.tag.differs',
};

const TAG_TONES: Readonly<Record<string, 'success' | 'warning'>> = {
  new: 'success',
  differs: 'warning',
};

function codeToolbarLabels(t: Translate): CodeToolbarLabels {
  return {
    codeLabel: t('configSync.code.lang'),
    wrapLabel: t('configSync.code.wrap'),
    unwrapLabel: t('configSync.code.unwrap'),
  };
}

function diffLabels(t: Translate): DiffBlockLabels {
  return {
    ...codeToolbarLabels(t),
    copy: t('configSync.code.copy'),
    copied: t('configSync.code.copied'),
    collapseAria: t('configSync.code.collapseAria'),
    expandAria: (hidden) => t('configSync.code.expandAria', { count: hidden }),
    collapse: t('configSync.code.collapse'),
    expand: (hidden) => t('configSync.code.expand', { count: hidden }),
  };
}

function RowBody({
  t,
  row,
}: {
  readonly t: Translate;
  readonly row: ConfigSyncRow;
}): JSX.Element {
  return row.ownBody === null ? (
    <CodeBlock
      code={row.body}
      lang="yaml"
      className={styles.code}
      copyLabel={t('configSync.code.copy')}
      copiedLabel={t('configSync.code.copied')}
      toolbarLabels={codeToolbarLabels(t)}
    />
  ) : (
    <DiffBlock
      diffs={[{ path: row.id, oldText: row.ownBody, newText: row.body }]}
      labels={diffLabels(t)}
      maxLines={DIFF_MAX_LINES}
      className={styles.code}
    />
  );
}

export function SourceRows({
  t,
  rows,
  picked,
  profile,
  onToggle,
}: {
  readonly t: Translate;
  readonly rows: readonly ConfigSyncRow[];
  readonly picked: readonly string[];
  readonly profile: string;
  readonly onToggle: (key: string, next: boolean) => void;
}): JSX.Element {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set());
  const toggleShown = (key: string): void => {
    setShown((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  return (
    <ul className={styles.rows}>
      {rows.map((row) => {
        const open = shown.has(row.key);
        const selected = picked.includes(row.key);
        return (
          <li key={row.key} className={styles.row}>
            <div className={styles.head}>
              <Checkbox
                checked={selected}
                label={row.id}
                title={row.state === 'differs' ? t('configSync.conflictNote') : undefined}
                className={styles.pick}
                onChange={(next) => onToggle(row.key, next)}
              />
              <Tag tone={TAG_TONES[row.state] ?? 'success'}>
                {t(TAG_KEYS[row.state] ?? 'configSync.tag.new')}
              </Tag>
              <Button
                variant="ghost"
                size="sm"
                className={styles.view}
                aria-expanded={open}
                onClick={() => toggleShown(row.key)}
              >
                {open ? t('configSync.hide') : t('configSync.view')}
              </Button>
            </div>
            {row.missing.length === 0 ? null : (
              <div className={styles.notes}>
                {row.missing.map((pkg) => (
                  <span key={pkg} className={styles.missing}>
                    {t('configSync.missing', { pkg, profile })}
                  </span>
                ))}
              </div>
            )}
            {row.state === 'differs' && selected ? (
              <div className={styles.notes}>
                <span className={styles.conflict}>{t('configSync.conflictNote')}</span>
              </div>
            ) : null}
            {open ? <RowBody t={t} row={row} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
