import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tip } from '@/shared/components/Tip';
import { checkedAgo } from '../rightbar/market-freshness';
import type { LatestCheckSummary } from '../rightbar/market-rows';
import styles from './market-check.module.css';

export interface MarketCheckProps {
  readonly t: Translate;
  readonly checkedAt: number | null;
  readonly latestCheck?: LatestCheckSummary | undefined;
  readonly checking: boolean;
  readonly failed: boolean;
  readonly disabled: boolean;
  readonly onCheck: () => void;
}

export function MarketCheck({
  t,
  checkedAt,
  latestCheck = { checked: 0, unknown: 0 },
  checking,
  failed,
  disabled,
  onCheck,
}: MarketCheckProps) {
  const parts: string[] = [];
  if (checking) {
    parts.push(t('panels.market.checkingNow'));
  } else {
    if (latestCheck.checked > 0 && checkedAt !== null) {
      parts.push(t('panels.market.checkedAt', { time: checkedAgo(checkedAt, t) }));
    }
    if (failed) parts.push(t('panels.market.checkFailed'));
    else if (latestCheck.unknown > 0) {
      parts.push(t('panels.market.latestPartial', { n: String(latestCheck.unknown) }));
    }
  }
  const status = parts.length === 0 ? null : parts.join(' · ');
  return (
    <span className={styles.check}>
      {status === null ? null : (
        <span className={styles.status} aria-live="polite">
          {status}
        </span>
      )}
      <Tip label={t('panels.market.checkUpdates')}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={styles.button}
          aria-label={t('panels.market.checkUpdates')}
          disabled={disabled || checking}
          icon={
            <span className={`${styles.icon}${checking ? ' wb-spinning' : ''}`} aria-hidden="true">
              <IconRefreshOutlineRegular size={14} />
            </span>
          }
          onClick={onCheck}
        />
      </Tip>
    </span>
  );
}
