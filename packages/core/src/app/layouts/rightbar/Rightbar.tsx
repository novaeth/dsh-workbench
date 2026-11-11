import dayjs from 'dayjs';
import { Fragment, createElement as h, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Tip } from '@/shared/components/Tip';
import { devSurface } from '@/shared/dev-surface';
import type { ClientUnitRegistry } from '@/kernel/client/registry';
import type {
  SessionsSnapshot,
  SnapshotSelectorHook,
  Translate,
  WorkspaceSnapshot,
} from '@dsh-workbench/shared';
import { CardAnchor, CardBoundary, CenteredState } from '@dsh-workbench/shared';
import type { ModuleSummary, PanelStep, SuiteWorld } from '@dsh-workbench/shared';
import { IconBrandMark } from '@dsh-workbench/shared';
import { useCapabilityMap } from '@/shared/hooks/use-capability-gate';

import { Breadcrumbs, type StepTitleKeyOf } from './Breadcrumbs';
import { publishBoardProbe, BOARD_PROBE_UNKNOWN } from './board-fact';
import { BoardEmpty } from './BoardEmpty';
import { PanelModules } from './PanelModules';
import { aggregateSummaries, selectBoardModules } from './board-selection';
import { planBoard, type BoardPlan } from './board-plan';
import { BoardGrid, ModuleHost, workspacePathOf } from './BoardGrid';
import type { BoardRegistry } from '@/kernel/client/board-registry';
import type { RightbarState } from './store';
import { rightbarPresentation } from './presentation';
import { createSuiteWorld } from './suite-world';
import { useBoardWorkspace, useEnabledUnits, type PanelBoardView } from './use-panels';
import { reportPanelCrash, setPanelWorkspace } from '@/shared/hooks/panel-state-report';
import { Button, IconPanelLeftOutlineRegular, IconRefreshOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';
import styles from './Rightbar.module.css';

export interface RightbarProps extends RightbarActions {
  readonly t: Translate;
  readonly width: number;
  readonly viewportWidth: number;
  readonly canShow: boolean;
  readonly useSessions: SnapshotSelectorHook<SessionsSnapshot>;
  readonly useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>;
  readonly useRightbar: SnapshotSelectorHook<RightbarState>;
}

export interface RightbarActions {
  applyRightbar: (presentation: { shown: boolean; track: boolean; fullscreen: boolean }) => void;
  toggleRightbar: () => void;
  openPanel: (step: PanelStep) => void;
  goToPanel: (index: number) => void;
  openMarket: () => void;
  buildModule: () => void;
  units: ClientUnitRegistry;
}

interface PanelHeaderProps {
  readonly t: Translate;
  readonly trail: readonly PanelStep[];
  readonly onGoTo: (index: number) => void;
  readonly titleKeyOf: StepTitleKeyOf;
  readonly refreshing: boolean;
  readonly at: number | null;
  readonly refreshEnabled: boolean;
  readonly onRefresh: () => void;
  readonly modulesOpen: boolean;
  readonly onModulesOpenChange: (open: boolean) => void;
  readonly enabledUnits: PanelBoardView | null;
  readonly manifests: ReturnType<ClientUnitRegistry['manifests']>;
  readonly workspace: string | null;
  readonly refreshToken: number;
  readonly onOpenMarket: () => void;
  readonly onCollapse: () => void;
}

function PanelHeader({
  t,
  trail,
  onGoTo,
  titleKeyOf,
  refreshing,
  at,
  refreshEnabled,
  onRefresh,
  modulesOpen,
  onModulesOpenChange,
  enabledUnits,
  manifests,
  workspace,
  refreshToken,
  onOpenMarket,
  onCollapse,
}: PanelHeaderProps) {
  return (
      <header className="wb-panelHeader">
        <div className="wb-tabStrip">
          <Breadcrumbs trail={trail} onGoTo={onGoTo} titleKeyOf={titleKeyOf} t={t} />
          <span className="wb-stripFill" />
          <div className="wb-stripChrome">
            <Tip
              label={
                refreshing
                  ? t('rightbar.refreshing')
                  : at === null
                    ? t('rightbar.refresh')
                    : `${t('rightbar.refresh')} · ${t('rightbar.updatedAt', {
                        time: dayjs(at).format('HH:mm'),
                      })}`
              }
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={`wb-stripButton${refreshing ? ' wb-spinning' : ''}`}
                aria-label={refreshing ? t('rightbar.refreshing') : t('rightbar.refresh')}
                disabled={refreshing || !refreshEnabled}
                icon={<IconRefreshOutlineRegular size={16} />}
                onClick={onRefresh}
              />
            </Tip>
            <PanelModules
              t={t}
              open={modulesOpen}
              onOpenChange={onModulesOpenChange}
              enabledUnits={enabledUnits}
              workspace={workspace}
              refreshToken={refreshToken}
              manifests={manifests}
              onOpenMarket={onOpenMarket}
            />
            <Tip label={t('rightbar.collapse')}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="wb-stripButton"
                aria-label={t('rightbar.collapse')}
                icon={
                  <span className="wb-stripIconFlip">
                    <IconPanelLeftOutlineRegular size={16} />
                  </span>
                }
                onClick={onCollapse}
              />
            </Tip>
          </div>
        </div>
      </header>
  );
}

function BoardContent({
  top,
  plan,
  world,
  board,
  panelWidth,
  panelToken,
  onPanelRefresh,
  onNavigate,
  onOpenMarket,
  onSummary,
  onOpenModules,
  onCardFailure,
  buildModule,
  t,
}: {
  top: PanelStep;
  plan: BoardPlan;
  world: SuiteWorld;
  board: BoardRegistry;
  panelWidth: number;
  panelToken: number;
  onPanelRefresh: () => void;
  onNavigate: (step: PanelStep) => void;
  onOpenMarket: () => void;
  onSummary: (id: string, summary: ModuleSummary) => void;
  onOpenModules: () => void;
  onCardFailure: (unit: string, reason: string) => void;
  buildModule: () => void;
  t: Translate;
}) {
  if (top.kind !== 'board') {
    const owner = board.stepOwner(top.kind);
    if (owner === undefined) {
      return <CenteredState icon={<IconBrandMark size={32} />} title={t('panels.unknownStep')} />;
    }
    const key = `${owner.id}:${top.kind}`;
    return (
      <CardAnchor key={key} unit={owner.id}>
        <CardBoundary
          unit={owner.id}
          resetKey={`${key}:${panelToken}:${workspacePathOf(world)}`}
          t={t}
          onFailure={(reason) => onCardFailure(owner.id, reason)}
        >
          <ModuleHost
            module={owner}
            step={top.kind}
            world={world}
            panelToken={panelToken}
            onPanelRefresh={onPanelRefresh}
            onNavigate={onNavigate}
            onOpenMarket={onOpenMarket}
            onSummary={onSummary}
            t={t}
          />
        </CardBoundary>
      </CardAnchor>
    );
  }

  return (
    <>
      {plan.reading ? (
        <CenteredState icon={null} title={<TextShimmer active>{t('panels.reading')}</TextShimmer>} />
      ) : null}
      {plan.empty ? (
        <BoardEmpty
          t={t}
          onBuildModule={buildModule}
          onOpenModules={onOpenModules}
          onOpenMarket={onOpenMarket}
        />
      ) : null}
      <BoardGrid
        entries={plan.modules}
        panelWidth={panelWidth}
        world={world}
        panelToken={panelToken}
        onPanelRefresh={onPanelRefresh}
        onNavigate={onNavigate}
        onOpenMarket={onOpenMarket}
        onSummary={onSummary}
        onCardFailure={onCardFailure}
        t={t}
      />
    </>
  );
}

export function Rightbar(props: RightbarProps) {
  const { modules, manifests, titleKeyOf, state, sessions, workspaces, panelToken, refreshPanel, capabilities, board } = useRightbarWiring(props);
  const boardWorkspace = board.path;
  const panelBoard = useEnabledUnits(panelToken, boardWorkspace);
  const enabledUnits = panelBoard?.units ?? null;

  const [modulesOpen, setModulesOpen] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const devBoard = devSurface.useBoard({ manifests, all: modules.all(), search: window.location.search });

  const visibleModules = selectBoardModules(enabledUnits, (id) => modules.byId(id), capabilities);
  const plan = planBoard(
    devBoard.shape,
    { modules: visibleModules, configRead: panelBoard !== null },
    devBoard.seed,
  );

  const world = createSuiteWorld({
    workspaces,
    sessions,
    manifests,
    units: enabledUnits,
    capabilities,
    ...(board.workspace === null ? {} : { selectedWorkspaceId: board.workspace.workspaceId }),
  });
  const [summaries, setSummaries] = useState<Record<string, ModuleSummary>>({});
  const onSummary = useCallback((id: string, next: ModuleSummary) => {
    setSummaries((prev) => ({ ...prev, [id]: next }));
  }, []);
  const onCardFailure = useCallback((unit: string, reason: string) => {
    reportPanelCrash({ unit, reason });
  }, []);
  const fixtureMode = devBoard.mode;
  useEffect(() => {
    setPanelWorkspace(fixtureMode ? null : boardWorkspace);
  }, [boardWorkspace, fixtureMode]);
  const summary = aggregateSummaries(
    plan.modules
      .map((entry) => summaries[entry.module.id])
      .filter((item): item is ModuleSummary => item !== undefined),
  );
  const feedEnabled = plan.modules.length > 0 || plan.reading;

  const shown = state.expanded;
  useLayoutEffect(() => {
    const el = asideRef.current;
    const drawnNow = (): boolean => {
      if (el === null) return false;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
    };
    const publish = (): void => {
      publishBoardProbe({
        workbench: true,
        where: boardWorkspace ?? '',
        bar: true,
        board: fixtureMode ? '' : (boardWorkspace ?? ''),
        open: shown,
        drawn: drawnNow(),
      });
    };
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    if (observer !== null && el !== null) observer.observe(el);
    return () => {
      observer?.disconnect();
      publishBoardProbe(BOARD_PROBE_UNKNOWN);
    };
  }, [boardWorkspace, fixtureMode, shown]);
  const presentation = rightbarPresentation({
    shown,
    viewportWidth: props.viewportWidth,
    canShow: props.canShow,
  });
  const { fullscreen } = presentation;
  const panelWidth = fullscreen ? '100vw' : props.width > 0 ? `${props.width}px` : '100%';
  const panelPixels = fullscreen ? props.viewportWidth : props.width > 0 ? props.width : 0;
  const applyRightbar = props.applyRightbar;
  useLayoutEffect(() => {
    applyRightbar({ shown, track: presentation.track, fullscreen: presentation.fullscreen });
  }, [applyRightbar, shown, presentation.track, presentation.fullscreen]);

  const top = state.trail[state.trail.length - 1] ?? { kind: 'board' };
  const navigate = (step: PanelStep) => props.openPanel(step);
  const openMarket = () => props.openMarket();

  return (
    <aside
      ref={asideRef}
      className={`wb-rightbar ${styles.panel}`}
      style={{ width: panelWidth }}
      data-open={shown ? '' : undefined}
      data-fullscreen={fullscreen ? '' : undefined}
      data-wb-board={fixtureMode ? undefined : (boardWorkspace ?? undefined)}
      data-wb-open={fixtureMode || !shown ? undefined : ''}
      aria-label={props.t('rightbar.label')}
    >
      <PanelHeader
        t={props.t}
        trail={state.trail}
        onGoTo={props.goToPanel}
        titleKeyOf={titleKeyOf}
        refreshing={summary.refreshing}
        refreshEnabled={feedEnabled}
        at={summary.at}
        onRefresh={refreshPanel}
        modulesOpen={modulesOpen}
        onModulesOpenChange={setModulesOpen}
        enabledUnits={panelBoard}
        manifests={manifests}
        workspace={boardWorkspace}
        refreshToken={panelToken}
        onOpenMarket={openMarket}
        onCollapse={props.toggleRightbar}
      />

      {devBoard.strip(top.kind === 'board')}

      <div className={`wb-panelBody${plan.repeated ? ' wb-panelMany' : ''}`}>
        <BoardContent
          top={top}
          plan={plan}
          world={world}
          board={modules}
          panelWidth={panelPixels}
          panelToken={panelToken}
          onPanelRefresh={refreshPanel}
          onNavigate={navigate}
          onOpenMarket={openMarket}
          onSummary={onSummary}
          onOpenModules={() => setModulesOpen(true)}
          onCardFailure={onCardFailure}
          buildModule={props.buildModule}
          t={props.t}
        />
      </div>
    </aside>
  );
}

function useRightbarWiring(props: RightbarProps) {
  const units = props.units;
  const subscribeUnits = useCallback((listener: () => void) => units.subscribe(listener), [units]);
  const unitsRevision = useCallback(() => units.version(), [units]);
  useSyncExternalStore(subscribeUnits, unitsRevision);

  const modules = units.board;
  const manifests = units.manifests();
  const titleKeyOf = (kind: string): string | undefined => modules.stepOwner(kind)?.steps?.[kind]?.titleKey;

  const state = props.useRightbar((snapshot) => snapshot);
  const sessions = props.useSessions((snapshot) => snapshot);
  const workspaces = props.useWorkspaces((snapshot) => snapshot);

  const [panelToken, setPanelToken] = useState(0);
  const refreshPanel = useCallback(() => setPanelToken((value) => value + 1), []);
  const { capabilities } = useCapabilityMap(panelToken);
  const board = useBoardWorkspace(workspaces, sessions);
  return { units, subscribeUnits, unitsRevision, modules, manifests, titleKeyOf, state, sessions, workspaces, panelToken, refreshPanel, capabilities, board };
}
