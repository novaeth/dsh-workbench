import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketDetailFact } from '../rightbar/market-detail-facts';
import styles from './MarketPage.module.css';

export function detailFacts({
  t,
  facts,
}: {
  readonly t: Translate;
  readonly facts: readonly MarketDetailFact[];
}) {
  return (
    <div className={styles.discoverFacts}>
      {facts.map((fact) => (
        <div key={`${fact.labelKey}:${fact.value}`} className={styles.discoverFactRow}>
          <span className={styles.discoverFactKind}>{t(fact.labelKey)}</span>
          <span className={styles.discoverFactValue}>
            {fact.tags === undefined ? null : (
              <span className={styles.discoverTags}>
                {fact.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </span>
            )}
            {fact.tags !== undefined ? null : fact.link === true ? (
              <a
                className={styles.discoverLink}
                href={fact.value}
                target="_blank"
                rel="noopener noreferrer"
              >
                {fact.value}
              </a>
            ) : fact.code === true ? (
              <code className={styles.discoverCode}>{fact.value}</code>
            ) : (
              fact.value
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
