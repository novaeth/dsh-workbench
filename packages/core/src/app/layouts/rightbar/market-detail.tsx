import { Fragment, createElement as h } from 'react';
import type { Translate } from '@dsh-workbench/shared';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarketFailure, MarketRow, MarketRowAction, MarketState } from './market-row-types';
import { MARKET_STATE_KEY, marketRowTitle } from './market-rows';
import { marketRowKind, packageIcon } from './market-row-icon';
import type { Pending } from './market-view-text';
import type { SharedState } from './market-shared-rows';
import type { PackageKind } from './market-row-icon';
import { MarketRowControls, MarketRowFailure } from './market-section';
import { FailureCard } from './FailureCard';
import { rowProblemCardOf } from './market-problem-card';
import { SharedActions } from './SharedSection';
import { marketDetailFacts, type MarketRuntimeFact } from './market-detail-facts';
import { dependencyRowActions, type DetailDependency } from './market-detail-deps';
import { DependencyLine } from './dependency-line';
import { detailFacts } from '../market/detail-facts';
import {
  installedDescription,
  installedDetailPanel,
  installedDetailTabs,
  installedDetailTop,
} from './installed-detail-parts';
import type { InstalledDetailRecheckProps, InstalledDetailTabProps } from './installed-detail-types';
import styles from '../market/MarketPage.module.css';

const DEPENDENCY_ICON_KIND: Readonly<Record<DetailDependency['kind'], PackageKind>> = {
  extension: 'plugin',
  lib: 'lib',
  bin: 'command',
  env: 'env',
};

const DEPENDENCY_STATE: Readonly<Record<DetailDependency['status'], SharedState>> = {
  ok: 'installed',
  outdated: 'outdated',
  unsatisfied: 'unsatisfied',
  missing: 'missing',
  unchecked: 'unchecked',
};

const DEPENDENCY_KIND_KEY: Readonly<Record<DetailDependency['kind'], string>> = {
  extension: 'panels.market.depKindExtension',
  lib: 'panels.market.depKindLib',
  bin: 'panels.market.depKindBin',
  env: 'panels.market.depKindEnv',
};

const STATE_TONE: Readonly<Record<MarketState, 'neutral' | 'success' | 'warning' | 'danger'>> = {
  checking: 'neutral',
  installed: 'success',
  inactive: 'warning',
  unusable: 'danger',
  broken: 'danger',
  unsupported: 'warning',
  outdated: 'warning',
  'older-on-disk': 'warning',
  'pending-restart': 'warning',
  'pending-followup': 'warning',
  missing: 'neutral',
  unchecked: 'neutral',
  unknown: 'neutral',
};

export interface MarketDetailProps extends InstalledDetailTabProps, InstalledDetailRecheckProps {
  readonly t: Translate;
  readonly row: MarketRow;
  readonly pending: Pending | null;
  readonly failure: MarketFailure | null;
  readonly notice: string | null;
  readonly boardBusy?: boolean | undefined;
  readonly onBack: () => void;
  readonly onRequest: (action: MarketRowAction) => void;
  readonly onDefault?: ((next: boolean) => void) | undefined;
  readonly onApproveBuilds?: (() => void) | undefined;
  readonly dependencies?: readonly DetailDependency[] | undefined;
  readonly runtime?: MarketRuntimeFact | undefined;
}

export function MarketDetail({
  t,
  row,
  pending,
  failure,
  notice,
  boardBusy,
  onBack,
  onRequest,
  onDefault,
  onApproveBuilds,
  onRecheck,
  rechecking,
  tab,
  onTab,
  info,
  dependencies = [],
  runtime,
}: MarketDetailProps) {
  const activeTab = tab ?? 'overview';
  const title = marketRowTitle(row, t);
  const facts = marketDetailFacts(row, t, info, runtime);
  const version = row.version?.installed;
  const problemModel = row.problem === undefined ? undefined : rowProblemCardOf(t, row);
  const hiddenNote = problemModel !== undefined && row.problem?.kind !== 'startup';
  const noteText = row.note === undefined || hiddenNote ? null : t(row.note.key, row.note.params);
  const problemAction =
    row.problem?.kind === 'drift'
      ? () => onRequest('install-version')
      : row.problem?.kind === 'reinstall'
        ? () => onRequest('update-workbench')
        : onRecheck;
  const idPrefix = `installed-detail-${row.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  return (
    <div className={styles.discoverDetail} data-market-detail={row.id}>
      {installedDetailTop({
        t,
        onBack,
        icon: packageIcon(marketRowKind(row)),
        tabs: installedDetailTabs({ t, idPrefix, value: activeTab, onChange: (next) => onTab?.(next) }),
        end: (
          <div className={styles.marketDetailEnd}>
            <MarketRowControls
              t={t}
              row={row}
              pending={pending}
              boardBusy={boardBusy}
              onRequest={onRequest}
              onDefault={onDefault}
            />
          </div>
        ),
        children: (
          <div className={styles.discoverMain}>
            <div className={styles.discoverTitleRow}>
              <h3 className={styles.discoverDetailTitle}>{title}</h3>
              {version === undefined ? null : <Tag tone="neutral">{version}</Tag>}
              {row.state === 'installed' ? null : (
                <Tag tone={STATE_TONE[row.state]}>{t(row.stateKey ?? MARKET_STATE_KEY[row.state])}</Tag>
              )}
              {row.local === true ? <Tag tone="neutral">{t('panels.market.localMark')}</Tag> : null}
            </div>
            {row.pkg === undefined ? null : (
              <p className={styles.marketDetailName}>
                <code>{row.pkg}</code>
              </p>
            )}
          </div>
        ),
      })}
      {installedDetailPanel({
        t,
        idPrefix,
        tab: activeTab,
        pkg: row.pkg,
        version,
        children: (
          <Fragment>
            {installedDescription(info)}
            {notice === null ? null : <p className={styles.discoverDetailText}>{notice}</p>}
            <MarketRowFailure
              t={t}
              failure={failure}
              onRecheck={onRecheck}
              rechecking={rechecking}
              onApprove={onApproveBuilds}
            />
            {problemModel === undefined || failure !== null ? null : (
              <FailureCard t={t} model={problemModel} extras={problemModel} onRecheck={problemAction} rechecking={rechecking} />
            )}
            {row.hint === undefined ? null : <p className={styles.discoverMuted}>{t(row.hint.key, row.hint.params)}</p>}
            {noteText === null ? null : (
              <p className={row.note?.tone === 'alert' ? styles.discoverError : styles.discoverMuted}>
                {noteText}
              </p>
            )}
            {facts.length === 0 ? null : (
              <section className={styles.discoverSection}>
                <h4 className={styles.discoverSectionTitle}>{t('panels.market.detailSourceTitle')}</h4>
                {detailFacts({ t, facts })}
              </section>
            )}
            {row.plugin === true || row.workbench === true ? null : (
            <section className={styles.discoverSection}>
              <h4 className={styles.discoverSectionTitle}>{t('panels.market.detailDepsTitle')}</h4>
              {dependencies.length === 0 ? (
                <p className={styles.discoverMuted}>{t('panels.market.detailDepsEmpty')}</p>
              ) : (
                <ul className={styles.marketListFlat}>
                  {dependencies.map((need) => (
                    <li key={`${need.kind}:${need.name}`} className={styles.marketRow}>
                      <DependencyLine
                        t={t}
                        kind={DEPENDENCY_ICON_KIND[need.kind]}
                        label={need.name}
                        version={{
                          ...(need.installed === undefined ? {} : { installed: need.installed }),
                          ...(need.latest === undefined ? {} : { latest: need.latest }),
                        }}
                        state={DEPENDENCY_STATE[need.status]}
                        stateText={
                          need.kind === 'env' && need.status === 'missing'
                            ? t('panels.market.depEnvNotSet')
                            : undefined
                        }
                        note={[
                          t(DEPENDENCY_KIND_KEY[need.kind]),
                          ...(need.optional === true ? [t('panels.market.depOptional')] : []),
                        ].join(t('panels.market.listSeparator'))}
                      />
                      <div className={styles.marketEnd}>
                        <SharedActions
                          t={t}
                          actions={dependencyRowActions(need)}
                          running={null}
                          locked={pending !== null}
                          onAct={onRequest}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            )}
          </Fragment>
        ),
      })}
    </div>
  );
}
