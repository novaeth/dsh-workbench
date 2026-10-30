import { Fragment, createElement as h } from 'react';
import type { ReactNode, Translate } from '@dsh-workbench/shared';
import type { MarketFailure, MarketRow, MarketRowAction } from './market-row-types';
import type { SharedRow } from './market-shared-rows';
import type { Pending } from './market-view-text';
import { marketFootVisible } from './market-view-text';
import { marketOrder, marketRowTitle, marketSections } from './market-rows';
import type { VersionsPart } from '../market/use-module-versions';
import { MarketSection } from './market-section';
import { SharedSection } from './SharedSection';
import { marketSectionIcon } from './market-section-icon';
import { PanelFoot } from '@/shared/components/PanelFoot';
import styles from '../market/MarketPage.module.css';

const CONFIRM_UNINSTALL: readonly MarketRowAction[] = ['uninstall', 'remove-bundle', 'uninstall-plugin'];
const NO_ROWS: readonly MarketRow[] = [];

export function MarketBody({
  t,
  self,
  shown,
  pluginList,
  installedList,
  shared,
  pending,
  failed,
  notice,
  act,
  onConfirming,
  setDefault,
  boardBusy,
  checks,
  onRecheck,
  rechecking,
  runtimePluginMarket,
  onOpenDetail,
}: {
  readonly t: Translate;
  readonly runtimePluginMarket?: boolean | undefined;
  readonly self: MarketRow | undefined;
  readonly shown: readonly MarketRow[];
  readonly pluginList: readonly MarketRow[];
  readonly installedList: readonly MarketRow[];
  readonly shared: readonly SharedRow[];
  readonly pending: Pending | null;
  readonly failed: MarketFailure | null;
  readonly notice: string | null;
  readonly act: (id: string, action: MarketRowAction) => Promise<void>;
  readonly onConfirming: (id: string | null) => void;
  readonly setDefault: (id: string, next: boolean) => Promise<void>;
  readonly boardBusy: boolean;
  readonly checks: Readonly<Record<VersionsPart, ReactNode>>;
  readonly onRecheck: () => void;
  readonly rechecking: boolean;
  readonly onOpenDetail?: ((id: string) => void) | undefined;
}) {
  const failureOf = (id: string): MarketFailure | null => (failed?.id === id ? failed : null);
  const foot = marketFootVisible(shown, installedList);
  const sections = marketSections(
    marketOrder([...shown, ...installedList], (row) => marketRowTitle(row, t)),
  );
  const installed = sections.find((section) => section.id === 'installed');
  const pendingSection = sections.find((section) => section.id === 'not-installed');
  return (
    <>
      {notice === null ? null : <div className={styles.marketNote}>{notice}</div>}
      <MarketSection
        t={t}
        rows={self === undefined ? [] : [self]}
        onDefault={setDefault}
        boardBusy={boardBusy}
        pending={pending}
        failureOf={failureOf}
        act={act}
        confirmActions={CONFIRM_UNINSTALL}
        onConfirming={onConfirming}
        onOpenDetail={onOpenDetail}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />
      {self === undefined ? null : (
        <div className={styles.marketSelfDivider} aria-hidden="true" />
      )}
      <MarketSection
        t={t}
        titleKey="panels.market.sectionInstalled"
        icon={marketSectionIcon('installed')}
        rows={installed?.rows ?? NO_ROWS}
        keepHead
        headAction={checks.modules}
        onDefault={setDefault}
        boardBusy={boardBusy}
        pending={pending}
        failureOf={failureOf}
        act={act}
        confirmActions={CONFIRM_UNINSTALL}
        onConfirming={onConfirming}
        onOpenDetail={onOpenDetail}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />
      {pendingSection === undefined ? null : (
        <MarketSection
          t={t}
          titleKey={pendingSection.titleKey}
          icon={marketSectionIcon('pending')}
          rows={pendingSection.rows}
          onDefault={setDefault}
          boardBusy={boardBusy}
          pending={pending}
          failureOf={failureOf}
          act={act}
          confirmActions={CONFIRM_UNINSTALL}
          onConfirming={onConfirming}
        onOpenDetail={onOpenDetail}
          onRecheck={onRecheck}
          rechecking={rechecking}
        />
      )}
      {runtimePluginMarket === false ? null : (
      <MarketSection
        t={t}
        titleKey="panels.market.sectionPlugins"
        icon={marketSectionIcon('plugins')}
        rows={pluginList}
        headAction={checks.plugins}
        onDefault={setDefault}
        boardBusy={boardBusy}
        pending={pending}
        failureOf={failureOf}
        act={act}
        confirmActions={CONFIRM_UNINSTALL}
        onConfirming={onConfirming}
        onOpenDetail={onOpenDetail}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />
      )}

      {foot ? <PanelFoot size="md" text={t('panels.market.foot')} /> : null}

      <SharedSection
        t={t}
        rows={shared}
        pending={pending}
        failureOf={failureOf}
        act={act}
        onRecheck={onRecheck}
        rechecking={rechecking}
      />
    </>
  );
}

