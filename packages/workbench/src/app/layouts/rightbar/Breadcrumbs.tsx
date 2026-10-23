import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import type { PanelStep } from '@dsh-workbench/shared';

import styles from './Breadcrumbs.module.css';

export type StepTitleKeyOf = (kind: string) => string | undefined;

export function stepLabel(step: PanelStep, titleKeyOf: StepTitleKeyOf, t: Translate): string {
  if (step.kind === 'board') return t('board.title');
  const titleKey = titleKeyOf(step.kind);
  return titleKey === undefined ? t('panels.unknownStep') : t(titleKey);
}

export interface BreadcrumbsProps {
  trail: readonly PanelStep[];
  onGoTo: (index: number) => void;
  titleKeyOf: StepTitleKeyOf;
  t: Translate;
}

export function Breadcrumbs({ trail, onGoTo, titleKeyOf, t }: BreadcrumbsProps) {
  return (
    <div className={styles.stripTabs} role="presentation">
      {trail.map((step, index) => {
        const current = index === trail.length - 1;
        return (
          <Fragment key={`${step.kind}-${index}`}>
            {index > 0 ? (
              <span className={styles.sep} aria-hidden="true">
                ›
              </span>
            ) : null}
            {current ? (
              <div className={`${styles.tab} ${styles.tabActive}`} aria-current="page">
                <span className={styles.tabTitle}>{stepLabel(step, titleKeyOf, t)}</span>
              </div>
            ) : (
              <button type="button" className={`${styles.tab} ${styles.tabQuiet}`} onClick={() => onGoTo(index)}>
                <span className={styles.tabTitle}>{stepLabel(step, titleKeyOf, t)}</span>
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
