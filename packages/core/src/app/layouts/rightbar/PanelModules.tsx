import { createElement as h, useEffect, useRef } from 'react';
import { Tip } from '@/shared/components/Tip';
import type { Translate } from '@dsh-workbench/shared';
import { IconModules } from '@/shared/components/IconModules';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { markNextProbeSilent } from '@/shared/hooks/use-capabilities';
import { useCapabilityMap } from '@/shared/hooks/use-capability-gate';

import styles from './ModulesPage.module.css';
import { MARKET_STALE_MS, shouldProbeOnEnter } from './market-freshness';
import { ModulesPage } from './ModulesPage';
import type { PanelBoardView } from './use-panels';
import { useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives';
import { dismissPanelByPointer } from './panel-dismiss';

export interface PanelModulesProps {
  readonly t: Translate;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly enabledUnits: PanelBoardView | null;
  readonly workspace: string | null;
  readonly refreshToken: number;
  readonly onOpenMarket: () => void;
}

export function PanelModules({
  t,
  open,
  onOpenChange,
  enabledUnits,
  workspace,
  refreshToken,
  onOpenMarket,
}: PanelModulesProps) {
  const { capabilities, checkedAt, forceProbe } = useCapabilityMap(refreshToken);
  const decided = useRef(false);
  useEffect(() => {
    if (!open || decided.current) return;
    decided.current = true;
    if (!shouldProbeOnEnter({ checkedAt, now: Date.now(), staleMs: MARKET_STALE_MS })) return;
    markNextProbeSilent();
    forceProbe();
  }, [open, checkedAt, forceProbe]);
  const root = useRef<HTMLDivElement | null>(null);

  useDismissOnOutsidePointer(root, open, (next) =>
    dismissPanelByPointer(next, document, onOpenChange),
  );

  const units = enabledUnits?.units ?? [];

  return (
    <div className={styles.trigger} ref={root}>
      <Tip label={t('panels.title')}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className={`wb-stripButton${open ? ' wb-stripButtonActive' : ''}`}
        aria-label={t('panels.title')}
        aria-expanded={open}
        icon={<IconModules size={16} />}
        onClick={() => onOpenChange(!open)}
      />
      </Tip>

      {open ? (
        <div className={styles.pop} role="dialog" aria-label={t('panels.title')}>
          <header className={styles.head}>
            <span className={styles.title}>{t('panels.tab.modules')}</span>
          </header>

          <ModulesPage
            t={t}
            units={units}
            plugins={enabledUnits?.plugins ?? []}
            capabilities={capabilities}
            loading={enabledUnits === null}
            own={enabledUnits?.own === true}
            onOpenMarket={onOpenMarket}
            workspace={workspace}
          />
        </div>
      ) : null}
    </div>
  );
}
