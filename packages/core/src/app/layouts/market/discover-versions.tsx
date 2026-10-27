import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { DiscoverEntry, DiscoverVersionRow } from '@/kernel/contract/market-index';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { latestVersionOf, publishDateText, versionFlagsOf } from './discover-view';
import styles from './MarketPage.module.css';

export interface DiscoverVersionsProps {
  readonly t: Translate;
  readonly locale: string;
  readonly entry: DiscoverEntry;
  readonly onInstall: (entry: DiscoverEntry, version: DiscoverVersionRow) => void;
}

export function DiscoverVersions({ t, locale, entry, onInstall }: DiscoverVersionsProps) {
  const latest = latestVersionOf(entry);
  return (
    <ul className={styles.discoverVersions} aria-label={t('panels.discover.versionsLabel', { name: entry.name })}>
      {entry.versions.map((version) => {
        const flags = versionFlagsOf(version, latest);
        const current = entry.installedVersion === version.version;
        const offered = !current && version.install !== 'installed' && version.compat !== 'incompatible';
        const date = publishDateText(version.publishTimestamp, locale);
        return (
          <li key={version.version} className={styles.discoverVersionRow} data-market-version={version.version}>
            <div className={styles.discoverMain}>
              <div className={styles.discoverTitleRow}>
                <span className={styles.discoverVersionName}>{version.version}</span>
                {flags.recommended ? <Tag tone="info">{t('panels.discover.tagRecommended')}</Tag> : null}
                {flags.prerelease ? <Tag tone="neutral">{t('panels.discover.tagPrerelease')}</Tag> : null}
                {current ? <Tag tone="success">{t('panels.discover.tagInstalled')}</Tag> : null}
                {flags.incompatible ? <Tag tone="warning">{t('panels.discover.tagIncompatible')}</Tag> : null}
              </div>
              <span className={styles.discoverMeta}>
                {flags.incompatible
                  ? t('panels.discover.badShellDetail', {
                      peer: version.peer ?? '',
                      current: version.engines?.dsh ?? '',
                    })
                  : date}
              </span>
            </div>
            {offered ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t('panels.discover.installVersionTitle', {
                  name: entry.name,
                  version: version.version,
                })}
                onClick={() => onInstall(entry, version)}
              >
                {t('panels.discover.cardInstall')}
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
