import { createElement as h, useState } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { marketText } from '@dsh-workbench/shared';
import type { DiscoverEntry, DiscoverVersionRow } from '@/kernel/contract/market-index';
import { Button, PluginArtworkDefault, Tag, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import { displayTitleOf, latestVersionOf, publishDateText } from './discover-view';
import styles from './MarketPage.module.css';

const ICON = 36;

export interface DiscoverRowsProps {
  readonly t: Translate;
  readonly locale: string;
  readonly entries: readonly DiscoverEntry[];
  readonly onOpen: (name: string) => void;
  readonly onInstall: (entry: DiscoverEntry, version: DiscoverVersionRow) => void;
  readonly onShowInstalled: (name: string) => void;
  readonly installDisabled?: boolean;
}

export function canInstall(version: DiscoverVersionRow | undefined): boolean {
  return version !== undefined && version.install !== 'installed' && version.compat !== 'incompatible';
}

export function sourceTextOf(t: Translate, version: DiscoverVersionRow): string {
  if (version.source.type === 'npm') {
    return t('panels.discover.sourceNpm', {
      registry: version.source.registry ?? t('panels.discover.sourceNpmDefault'),
    });
  }
  return t('panels.discover.sourceGit', { commit: version.source.commit.slice(0, 7) });
}

export function MarketIcon({ src, size = ICON }: { readonly src?: string | undefined; readonly size?: number }) {
  const [failed, setFailed] = useState<string | undefined>(undefined);
  if (src === undefined || src === failed) return <PluginArtworkDefault size={size} />;
  return (
    <img
      className={styles.discoverArtworkImage}
      src={src}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
    />
  );
}

export function EntryAction({
  t,
  entry,
  title,
  onInstall,
  onShowInstalled,
  installDisabled = false,
}: {
  readonly t: Translate;
  readonly entry: DiscoverEntry;
  readonly title: string;
  readonly onInstall: (entry: DiscoverEntry, version: DiscoverVersionRow) => void;
  readonly onShowInstalled: (name: string) => void;
  readonly installDisabled?: boolean;
}) {
  const latest = latestVersionOf(entry);
  if (latest === undefined) return null;
  if (latest.install === 'installed' || latest.install === 'update-available') {
    const update = latest.install === 'update-available';
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={update ? styles.discoverUpdateAction : undefined}
        aria-label={t('panels.discover.openInstalled', { name: title })}
        onClick={() => onShowInstalled(entry.name)}
      >
        {t(update ? 'panels.discover.cardUpdate' : 'panels.discover.cardInstalled')}
      </Button>
    );
  }
  if (latest.compat === 'incompatible') {
    return (
      <Tooltip
        label={t('panels.discover.noCompatibleVersion', { runtime: latest.engines?.dsh ?? '' })}
        side="bottom"
        portal
        delayMs={300}
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={styles.discoverBlocked}
          aria-disabled="true"
          aria-label={t('panels.discover.installTitle', { name: title })}
        >
          {t('panels.discover.cardInstall')}
        </Button>
      </Tooltip>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={installDisabled}
      aria-label={t('panels.discover.installTitle', { name: title })}
      onClick={() => onInstall(entry, latest)}
    >
      {t('panels.discover.cardInstall')}
    </Button>
  );
}

function EntryCard({
  t,
  locale,
  entry,
  onOpen,
  onInstall,
  onShowInstalled,
  installDisabled = false,
}: {
  readonly t: Translate;
  readonly locale: string;
  readonly entry: DiscoverEntry;
  readonly onOpen: (name: string) => void;
  readonly onInstall: (entry: DiscoverEntry, version: DiscoverVersionRow) => void;
  readonly onShowInstalled: (name: string) => void;
  readonly installDisabled?: boolean;
}) {
  const title = displayTitleOf(entry, locale);
  const latest = latestVersionOf(entry);
  const description = marketText(entry.description, locale);
  const date = publishDateText(latest?.publishTimestamp, locale);
  return (
    <li className={styles.discoverCard} data-market-entry={entry.name}>
      <span className={styles.discoverArtwork} aria-hidden="true">
        <MarketIcon src={entry.icon} />
      </span>
      <div className={styles.discoverMain}>
        <div className={styles.discoverTitleRow}>
          <button
            type="button"
            className={styles.discoverCardOpen}
            aria-label={t('panels.discover.openEntry', { name: title })}
            onClick={() => onOpen(entry.name)}
          >
            {title}
          </button>
          {entry.labels.map((label) => (
            <Tag key={label}>{label}</Tag>
          ))}
        </div>
        {description === '' ? null : <span className={styles.discoverDesc}>{description}</span>}
        <span className={styles.discoverMeta}>
          {latest === undefined
            ? date
            : t(entry.author === undefined ? 'panels.discover.entryMeta' : 'panels.discover.entryMetaAuthor', {
                version: latest.version,
                author: entry.author ?? '',
                date,
              })}
        </span>
      </div>
      <div className={styles.discoverEnd}>
        <EntryAction
          t={t}
          entry={entry}
          title={title}
          onInstall={onInstall}
          onShowInstalled={onShowInstalled}
          installDisabled={installDisabled}
        />
      </div>
    </li>
  );
}

export function DiscoverRows({ t, locale, entries, onOpen, onInstall, onShowInstalled, installDisabled }: DiscoverRowsProps) {
  return (
    <ul className={styles.discoverList}>
      {entries.map((entry) => (
        <EntryCard
          key={entry.name}
          t={t}
          locale={locale}
          entry={entry}
          onOpen={onOpen}
          onInstall={onInstall}
          onShowInstalled={onShowInstalled}
          installDisabled={installDisabled === true}
        />
      ))}
    </ul>
  );
}
