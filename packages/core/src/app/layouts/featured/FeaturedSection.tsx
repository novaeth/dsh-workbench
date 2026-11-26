import { createElement as h } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Translate } from '@dsh-workbench/shared';
import { reasonOf } from '@/shared/hooks/entry-report';
import styles from './FeaturedSection.module.css';

const FEATURED_PACKAGE = 'dsh-featured';

export interface FeaturedInstallTarget {
  readonly spec: string;
  readonly title: string;
  readonly version: string;
}

export interface FeaturedSectionProps {
  readonly t: Translate;
  readonly install: ((target: FeaturedInstallTarget) => void) | undefined;
}

function launchOf(install: (target: FeaturedInstallTarget) => void, target: FeaturedInstallTarget): boolean {
  try {
    install(target);
    return true;
  } catch (error) {
    console.warn(`[dsh-workbench] 精选插件没法发起安装：${reasonOf(error)}`);
    return false;
  }
}

export function FeaturedSection({ t, install }: FeaturedSectionProps): JSX.Element {
  const start = (): void => {
    if (install !== undefined) launchOf(install, { spec: FEATURED_PACKAGE, title: t('featured.tab'), version: '' });
  };
  return (
    <div className={styles.body}>
      <p className={styles.desc}>{t('featured.entry.desc')}</p>
      {install === undefined ? null : (
        <div className={styles.action}>
          <Button variant="primary" size="md" onClick={start}>{t('featured.entry.install')}</Button>
        </div>
      )}
    </div>
  );
}
