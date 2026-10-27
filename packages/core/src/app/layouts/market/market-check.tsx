import { createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Button, IconRefreshOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tip } from '@/shared/components/Tip';
import { checkedAgo } from '../rightbar/market-freshness';
import styles from './market-check.module.css';

export interface MarketCheckProps {
  readonly t: Translate;
  readonly scope: 'modules' | 'plugins';
  readonly checkedAt: number | null;
  readonly checking: boolean;
  readonly failed: boolean;
  readonly count: number;
  readonly disabled: boolean;
  readonly onCheck: () => void;
}

export function MarketCheck({
  t,
  scope,
  checkedAt,
  checking,
  failed,
  count,
  disabled,
  onCheck,
}: MarketCheckProps) {
  const status = checking
    ? t('panels.market.checkingNow')
    : failed
      ? t('panels.market.checkFailed')
      : checkedAt === null
        ? null
        : t('panels.market.checkedAt', { time: checkedAgo(checkedAt, t) });
  const alert = !checking && !failed && count > 0;
  const countText = t(
    scope === 'plugins' ? 'panels.market.pluginsUpdatesCount' : 'panels.market.updatesCount',
    { n: String(count) },
  );
  return (
    <span className={styles.check}>
      {alert ? <Tag tone="warning">{countText}</Tag> : null}
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
