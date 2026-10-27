import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import {
  Button,
  IconPlusOutlineRegular,
  PluginArtworkDefault,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './MarketPage.module.css';

export function DiscoverSkeleton({ label }: { readonly label: string }) {
  return (
    <ul className={styles.discoverList} role="status" aria-label={label} aria-busy="true">
      {[0, 1, 2, 3].map((index) => (
        <li key={String(index)} className={styles.discoverCard} aria-hidden="true">
          <span className={`${styles.discoverArtwork} ${styles.discoverSkeletonFill}`} />
          <div className={styles.discoverMain}>
            <span
              className={`${styles.discoverSkeletonBar} ${styles.discoverSkeletonTitle} ${styles.discoverSkeletonFill}`}
            />
            <span
              className={`${styles.discoverSkeletonBar} ${styles.discoverSkeletonDesc} ${styles.discoverSkeletonFill}`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DiscoverEmptyText({ text }: { readonly text: string }) {
  return <p className={styles.discoverMuted}>{text}</p>;
}

export function DiscoverLoading({ label }: { readonly label: string }) {
  return (
    <p className={styles.discoverLoading} role="status" aria-live="polite">
      <StateDot state="ongoing" />
      {label}
    </p>
  );
}

export function DiscoverFailure({
  t,
  text,
  onRetry,
}: {
  readonly t: Translate;
  readonly text: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className={styles.discoverFailure}>
      <p className={styles.discoverError} role="alert">
        <StateDot state="error" />
        {text}
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        {t('panels.discover.retry')}
      </Button>
    </div>
  );
}

export function DiscoverUninitialized({
  t,
  path,
  empty,
  onInit,
}: {
  readonly t: Translate;
  readonly path: string;
  readonly empty: boolean;
  readonly onInit: () => void;
}) {
  return (
    <div className={styles.discoverEmpty}>
      <PluginArtworkDefault size={48} />
      <p className={styles.discoverEmptyTitle}>{t('panels.discover.initTitle')}</p>
      <p className={styles.discoverMuted}>
        {empty ? t('panels.discover.emptyRepo') : t('panels.discover.missingIndex', { path })}
      </p>
      <Button type="button" size="sm" variant="primary" onClick={onInit}>
        {t('panels.discover.initCta')}
      </Button>
    </div>
  );
}

export function DiscoverNoSource({ t, onAdd }: { readonly t: Translate; readonly onAdd: () => void }) {
  return (
    <div className={styles.discoverEmpty}>
      <PluginArtworkDefault size={48} />
      <p className={styles.discoverEmptyTitle}>{t('panels.discover.noSource')}</p>
      <p className={styles.discoverMuted}>{t('panels.discover.noSourceHint')}</p>
      <Button type="button" size="sm" variant="primary" icon={<IconPlusOutlineRegular size={13} />} onClick={onAdd}>
        {t('panels.discover.addFirstSource')}
      </Button>
    </div>
  );
}
