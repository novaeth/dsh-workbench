import { createElement as h } from 'react';
import type {
  CodeToolbarLabels,
  DiffBlockLabels,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from '@dsh-workbench/shared';
import {
  Checkbox,
  CodeBlock,
  DiffBlock,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { ConfigSyncAsset, ConfigSyncRow } from '@/kernel/contract/config-sync';
import styles from './ConfigSyncRows.module.css';

const DIFF_MAX_LINES = 9;

const TAG_KEYS: Readonly<Record<string, string>> = {
  new: 'configSync.tag.new',
  differs: 'configSync.tag.differs',
  same: 'configSync.tag.asset',
};

const TAG_TONES: Readonly<Record<string, 'success' | 'warning'>> = {
  new: 'success',
  differs: 'warning',
  same: 'warning',
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

function assetText(t: Translate, asset: ConfigSyncAsset): string {
  if (asset.state === 'differs') {
    return asset.files.length > 1
      ? t('configSync.assetDiffersMany', { count: asset.files.length, path: asset.path })
      : t('configSync.assetDiffers', { path: asset.path });
  }
  if (asset.state === 'external') {
    return t('configSync.assetExternal', { path: asset.path, reason: asset.reason ?? '' });
  }
  return asset.files.length === 1
    ? t('configSync.assetMissingOne', { path: asset.path })
    : t('configSync.assetMissingMany', { count: asset.files.length, path: asset.path });
}

function AssetLine({
  t,
  asset,
  overwrite,
  onToggle,
}: {
  readonly t: Translate;
  readonly asset: ConfigSyncAsset;
  readonly overwrite: boolean;
  readonly onToggle: (key: string, next: boolean) => void;
}): JSX.Element | null {
  if (asset.state === 'same') return null;
  return (
    <div className={styles.asset}>
      <span className={styles.assetText} title={asset.files.map((file) => file.path).join('\n')}>
        {assetText(t, asset)}
      </span>
      {asset.state === 'differs' ? (
        <Checkbox
          checked={overwrite}
          label={t('configSync.assetOverwrite')}
          className={styles.assetPick}
          onChange={(next) => onToggle(asset.key, next)}
        />
      ) : null}
    </div>
  );
}

export function SourceRows({
  t,
  rows,
  picked,
  profile,
  assetOverwrites,
  onToggle,
  onToggleAsset,
}: {
  readonly t: Translate;
  readonly rows: readonly ConfigSyncRow[];
  readonly picked: readonly string[];
  readonly profile: string;
  readonly assetOverwrites: readonly string[];
  readonly onToggle: (key: string, next: boolean) => void;
  readonly onToggleAsset: (key: string, next: boolean) => void;
}): JSX.Element {
  return (
    <ul className={styles.rows}>
      {rows.map((row) => {
        const selectable =
          row.state !== 'same' ||
          row.assets.some((asset) => asset.state === 'missing' || asset.state === 'differs');
        const tagKey =
          row.state === 'same' && row.assets.some((asset) => asset.state === 'differs')
            ? 'configSync.tag.fileDiffers'
            : (TAG_KEYS[row.state] ?? 'configSync.tag.new');
        return (
          <li key={row.key} className={styles.row}>
            <div className={styles.head}>
              <Checkbox
                checked={picked.includes(row.key)}
                label={row.id}
                title={row.state === 'differs' ? t('configSync.conflictNote') : undefined}
                className={styles.pick}
                disabled={!selectable}
                onChange={(next) => onToggle(row.key, next)}
              />
              <Tag tone={TAG_TONES[row.state] ?? 'success'}>{t(tagKey)}</Tag>
            </div>
            {row.state === 'same' ? (
              <span className={styles.assetOnly}>{t('configSync.assetOnly')}</span>
            ) : row.ownBody === null ? (
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
            )}
            {row.missing.map((pkg) => (
              <span key={pkg} className={styles.missing}>
                {t('configSync.missing', { pkg, profile })}
              </span>
            ))}
            {row.assets.map((asset) => (
              <AssetLine
                key={asset.key}
                t={t}
                asset={asset}
                overwrite={assetOverwrites.includes(asset.key)}
                onToggle={onToggleAsset}
              />
            ))}
            {row.state === 'differs' && picked.includes(row.key) ? (
              <span className={styles.conflict}>{t('configSync.conflictNote')}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
