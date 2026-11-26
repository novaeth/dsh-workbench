import '@/shared/dev-surface/install';
import '@/shared/styles/index.css';
import { createElement } from 'react';
import type {
  ChildrenDecl,
  DshClientContext,
  DshLayoutPanels,
  MainPanelId,
  PanelStep,
  SessionTarget,
  WorkspaceId,
} from '@dsh-workbench/shared';
import { LOCALE_NS, UNITS_SERVICE } from '@dsh-workbench/shared';
import { readPanels, sessionMenuSeat, workspaceWrites } from '@/app/layouts/sidebar/sidebar-inject';
import { MARKET_PANEL_ID, registerMarketPanel } from '@/app/layouts/market/panel';
import { startMarketAutoCheck } from '@/app/layouts/market/market-auto-check';
import { registerDebugFooter } from '@/app/layouts/sidebar/debug-footer';
import { clientSurface } from '@/shared/api/platform/client';
import { registerWorkbenchSettings } from '@/app/layouts/workbench-settings/register';
import { installFeaturedEntry } from '@/app/layouts/featured/register';
import { selectProject, selectedProjectId } from '@/app/layouts/project-selection';
import { WORKSHOP_PAST_TITLES, WORKSHOP_TITLE, diyStartOptions, isWorkshopPath } from '@/shared/api/diy';
import { installWorkshopPreset } from '@/app/layouts/sidebar/workshop-preset';
import type { MessagesContribution } from '@dsh-workbench/shared';
import { assembleClientUnits } from '@/app/units';
import { unitTitlesOf } from '@/app/units/unit-titles';
import { createClientUnitRegistry } from '@/kernel/client/registry';
import { SchemaCard } from '@/shared/components/SchemaCard';
import { createUnitManifestLoader } from '@/app/units/manifests';
import type { UnitClientApi, UnitClientFace } from '@dsh-workbench/shared';
import { createBootGate } from '@/app/layouts/env-gate/boot-gate';
import { shellApprovalRenderer } from '@/app/layouts/approval-detail';
import { ColumnSwitch } from '@/app/layouts/rightbar/ColumnSwitch';
import { createDshColumnSource, DSH_COLUMN_POLL_MS } from '@/app/layouts/rightbar/dsh-column-source';
import { createDshBorrow } from '@/app/layouts/rightbar/dsh-borrow';
import { Tip } from '@/shared/components/Tip';
import { dockSessionId } from '@/app/layouts/flow/dock-session';
import { FlowProgress } from '@/app/layouts/flow/FlowProgress';
import { Rightbar } from '@/app/layouts/rightbar/Rightbar';
import { installContextChips } from '@/shared/api/context-chips';
import { setRuntimeTextResolver } from '@/shared/hooks/locale-text';
import { reportBootOk } from '@/shared/hooks/boot-ok';
import { currentSessionId, workspaceOfSession, type SessionSearch } from '@/modules/sessions';
import type { DshSidebarRight } from '@dsh-workbench/shared';
import { createRightbarStore, type RightbarColumn, type RightbarState } from '@/app/layouts/rightbar/store';
import {
  releaseRightbarWidthMemory,
  restoreRightbarWidth,
  seedRightbarWidth,
} from '@/app/layouts/rightbar/rightbar-width';
import { Sidebar } from '@/app/layouts/sidebar/Sidebar';
import {
  runtimeSidebarEdition,
  subscribeSidebarEdition,
} from '@/app/layouts/sidebar/edition';
import { bootSidebarEdition } from '@/app/layouts/sidebar/edition-boot';
import { LongTaskDot } from '@/app/layouts/sidebar/LongTaskDot';
import { LongTaskRun } from '@/shared/components/long-task/LongTaskRun';
import { LongTaskSection } from '@/shared/components/long-task/LongTaskSection';
import { LongTaskHover } from '@/app/layouts/sidebar/LongTaskHover';
import * as chipsModule from '@/shared/api/context-chips';
import * as apiResourceModule from '@/shared/hooks/use-api-resource';
import * as cardSummaryModule from '@/shared/hooks/use-card-summary';
import * as factsModule from '@/shared/hooks/use-facts';
import { useHostWrite } from '@/shared/hooks/use-host-write';
import { setWriteSessionSource } from '@/shared/hooks/write-session';
import { useLongTask } from '@/shared/hooks/use-long-task';
import * as capabilityGateModule from '@/shared/hooks/use-capability-gate';
import * as unitBoardModule from '@/shared/hooks/use-unit-board';
import * as visibleBusyModule from '@/shared/hooks/use-visible-busy';
import { usePlatform } from '@/shared/hooks/use-platform';
import * as blockerStateModule from '@/shared/components/BlockerState';
import { UnitBlocker } from '@/shared/components/UnitBlocker';
import { useUnitSetup } from '@/shared/hooks/use-unit-setup';
import {
  ActivityAction, ActivityBlock, ActivityLine, ApprovalDetail, ApprovalPlan, Card, CardAnchor, CardBoundary,
  CardHead, CenteredState, ChoiceGroup, ConfirmBar, EmptyState, Field, Form, FormActions, FormRow, FormRows,
  IconBrandMark, IconConversation, IconModuleMark, IconNpm, IconOpencli, IconPanelScreen, Link, LongTaskRow,
  longTaskIsLive,
  MIN_BUSY_MS, Note, Row, Rows, SaveBar, SelectField, SettingsSection, SetupShell, SkeletonRows, Spinner, Stack,
  StateBlock, TextField, apiGet, apiPost, blockerOf, blockerOfCapability, blockerOfError, cardIdOf, cx,
  defaultSelectFilter, dictionaries, duplicateKeysOf, errorReasonOf, excerpt, factOfRoute, filterSelectOptions,
  firstProblemOf, formFirstProblemOf, formValuesOf, holdBusy, mergeMessagesSkipping, parseJsonLoose,
  parseLocalTimestamp, pathBase, readText, relativeTime, relativeTimeAgo, relativeTimeBucket, relativeTimeCompact,
  revealFirstProblem, searchTextOf, selectCursorValue, selectEntries, shortenPath, stepSelectCursor,
  writeText,
} from '@dsh-workbench/shared';
export { SchemaCardView as schemaCard } from '@/shared/components/SchemaCardView';
import { attemptEntry, guardedEffect, reportEntryFailure } from '@/shared/hooks/entry-report';
import { boundaryOf } from '@/shared/components/EntryBoundary';

export const kit = {
  hooks: {
    ...apiResourceModule,
    ...cardSummaryModule,
    ...factsModule,
    useHostWrite,
    useLongTask,
    ...capabilityGateModule,
    ...unitBoardModule,
    ...visibleBusyModule,
    usePlatform,
    useUnitSetup,
  },
  components: {
    ...blockerStateModule,
    ActivityAction, ActivityBlock, ActivityLine, ApprovalDetail, ApprovalPlan, Card, CardAnchor,
    CardBoundary, CardHead, CenteredState, ChoiceGroup, ConfirmBar, EmptyState, Field, Form, FormActions, FormRow,
    FormRows, IconBrandMark, IconConversation, IconModuleMark, IconNpm, IconOpencli, IconPanelScreen, Link,
    LongTaskRow, LongTaskRun, LongTaskSection, Note, Row, Rows, SaveBar, SelectField, SettingsSection,
    SkeletonRows, Spinner, Stack,
    StateBlock, TextField, Tip, UnitBlocker, SetupShell, },

  api: { apiGet, apiPost, factOfRoute, ...chipsModule },
  lib: {
    longTaskIsLive,
    MIN_BUSY_MS, blockerOf, blockerOfCapability, blockerOfError, cardIdOf, cx, defaultSelectFilter, duplicateKeysOf,
    errorReasonOf, excerpt, filterSelectOptions, firstProblemOf, formFirstProblemOf, formValuesOf, holdBusy,
    parseJsonLoose, parseLocalTimestamp, pathBase, readText, relativeTime, relativeTimeAgo, relativeTimeBucket,
    relativeTimeCompact, revealFirstProblem, searchTextOf, selectCursorValue, selectEntries, shortenPath,
    stepSelectCursor, writeText,

  },
};

function messagesOf(units: readonly UnitClientFace[]): MessagesContribution[] {
  return units.map((face) => ({
    unit: face.unit,
    ...(face.messages === undefined ? {} : { messages: face.messages }),
  }));
}

const rightbarStore = createRightbarStore();

type RightbarObservable = {
  getSnapshot(): RightbarState;
  subscribe(listener: () => void): () => void;
};

export const inject = ['slots', 'locale', 'layout', 'uiWorkspace', 'workspaces', 'remote', 'remote.session', 'remote.agentPresets', 'inputTriggers', 'conversation', 'contextMenus', 'sessions'];

export function apply(ctx: DshClientContext): void {
  try {
    mount(ctx);
  } catch (error) {
    reportEntryFailure('mount', error);
    return;
  }
  reportBootOk();
}

function mount(ctx: DshClientContext): void {
  attemptEntry('locale', () => {
    setRuntimeTextResolver((text) => ctx.locale.resolveText?.({ zh: text.zh, en: text.en }) ?? text.zh);
  });
  const loadUnitManifests = createUnitManifestLoader();
  const units = createClientUnitRegistry({
    onUnknownUnit: () => loadUnitManifests(units),
    viewOf: (view, manifest) => (props) =>
      createElement(SchemaCard, { ...props, unit: manifest.id, view }),
  });
  attemptEntry('units', () => {
    ctx.provide(UNITS_SERVICE, {
      registerUnit: (face: UnitClientFace) => units.register(face),
      manifests: () => units.manifests(),
    } satisfies UnitClientApi);
    assembleClientUnits(units);
  });
  attemptEntry('units-manifests', () => loadUnitManifests(units));
  const store = rightbarStore;
  const observable: RightbarObservable = {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => store.subscribe(listener),
  };

  const sessionNow = (): string | undefined => {
    const sessions = ctx.get('sessions');
    const snapshot = sessions?.list.getSnapshot();
    return snapshot === undefined ? undefined : currentSessionId(snapshot, false);
  };
  setWriteSessionSource(sessionNow);
  attemptEntry('context-chips', () => installContextChips(ctx, { currentSessionId: sessionNow }));
  ctx.effect(() => guardedEffect('dictionaries', () => {
    let disposeDictionary: (() => void) | undefined;
    const publish = (): void => {
      disposeDictionary?.();
      const { dictionaries: merged, problems } = mergeMessagesSkipping(dictionaries, [
        unitTitlesOf(units.manifests()),
        ...messagesOf(units.all()),
      ]);
      for (const problem of problems) {
        console.warn(`[dsh-workbench] 模块 ${problem.unit} 的文案未合并（只有它少了这几句）：${problem.reason}`);
      }
      disposeDictionary = ctx.locale.register(LOCALE_NS, merged);
    };
    publish();
    const unsubscribe = units.subscribe(publish);
    return () => {
      unsubscribe();
      disposeDictionary?.();
    };
  }), 'dsh-workbench: dictionaries');

  const workshopWorkspace = () =>
    ctx.workspaces.list.getSnapshot().items.find((item) => isWorkshopPath(item.path));

  const startSessionIn = (workspaceId: string): void => {
    const options = diyStartOptions(workspaceId, workshopWorkspace()?.workspaceId);
    if (options === undefined) ctx.uiWorkspace.startSession(workspaceId as WorkspaceId);
    else ctx.uiWorkspace.startSession(workspaceId as WorkspaceId, options);
  };

  const buildModule = (): void => {
    const workshop = workshopWorkspace();
    if (workshop === undefined) {
      console.warn('[dsh-workbench] 工坊还没登记成工作区 —— 重启一次工作台');
      return;
    }
    selectProject(workshop.workspaceId);
    startSessionIn(workshop.workspaceId);
  };

  const layoutPanels = (ctx.layout as typeof ctx.layout & { readonly panels?: DshLayoutPanels }).panels;
  attemptEntry('rightbar-width', () => restoreRightbarWidth(layoutPanels));
  let rightbarWidthSeeded = false;
  const seedWidthOnce = (): void => {
    if (rightbarWidthSeeded) return;
    rightbarWidthSeeded = true;
    seedRightbarWidth(layoutPanels);
  };
  ctx.effect(() => () => releaseRightbarWidthMemory(layoutPanels), 'dsh-workbench: 记住右栏宽度');

  const rightbarActions = {
    openMarket: () => ctx.layout.selectPanel(MARKET_PANEL_ID as MainPanelId),
    applyRightbar: ({ shown, track, fullscreen }: { shown: boolean; track: boolean; fullscreen: boolean }) => {
      if (shown) {
        seedWidthOnce();
        ctx.layout.openRightbar(track, fullscreen);
      } else {
        ctx.layout.closeRightbar();
      }
    },
    toggleRightbar: () => {
      store.toggleExpanded();
      if (!store.getSnapshot().expanded) {
        ctx.layout.closeRightbar();
        return;
      }
      seedWidthOnce();
      ctx.layout.openRightbar(true, false);
    },
    openPanel: (step: PanelStep) => store.open(step),
    goToPanel: (index: number) => store.goTo(index),
    buildModule,
  };
  const rightbarHooks = { hooks: { rightbar: observable } };

  const sidebarRight = (): DshSidebarRight | undefined => ctx.get('sidebarRight');

  let workbenchColumnArmed = false;
  let disposeWorkbenchColumn: (() => void) | undefined;

  const armWorkbenchColumn = (): void => {
    if (workbenchColumnArmed) return;
    workbenchColumnArmed = true;
    disposeWorkbenchColumn = ctx.slots.inject('rightbar', () =>
      ctx.slots.register(
        { name: 'rightbar', priority: -1, locale: LOCALE_NS, inject: () => ({ ...rightbarActions, ...rightbarHooks, units }) },
        boundaryOf('rightbar', Rightbar),
      ),
    );
  };

  const releaseWorkbenchColumn = (): void => {
    workbenchColumnArmed = false;
    disposeWorkbenchColumn?.();
    disposeWorkbenchColumn = undefined;
  };

  const borrow = createDshBorrow({
    official: sidebarRight,
    yieldColumn: () => {
      store.setColumn('dsh');
      ctx.layout.closeRightbar();
      releaseWorkbenchColumn();
    },
    reclaimColumn: () => {
      store.setColumn('workbench');
      armWorkbenchColumn();
      store.setExpanded(true);
    },
  });

  const dshColumn = createDshColumnSource(() => borrow.open(), DSH_COLUMN_POLL_MS);

  const selectColumn = (column: RightbarColumn): void => {
    if (store.getSnapshot().column === column) {
      if (column === 'workbench') {
        rightbarActions.toggleRightbar();
        return;
      }
      borrow.toggle();
      return;
    }
    if (column === 'workbench') {
      borrow.back();
      return;
    }
    borrow.use();
  };

  ctx.effect(() => () => borrow.dispose(), 'dsh-workbench: 官方椅面订阅与借道');

  attemptEntry('rightbar-column', () => borrow.start());

  if (store.getSnapshot().column === 'workbench') armWorkbenchColumn();

  let ownSidebarRegistered = false;

  const searchSessions: SessionSearch = async (query, signal) => {
    const sessions = ctx.get('sessions');
    if (sessions === undefined) throw new Error('sessions service unavailable');
    const result = await sessions.search(query, signal);
    if (!result.ok) throw new Error(result.error.message);
    return {
      items: result.value.items.map((item) => ({ sessionId: item.sessionId, snippet: item.snippet })),
      hasMore: result.value.hasMore,
    };
  };

  const registerOwnSidebar = (): void => {
    if (ownSidebarRegistered) return;
    ownSidebarRegistered = true;
    ctx.slots.inject('sidebar', () =>
      ctx.slots.register(
        {
          name: 'sidebar',
          priority: -1,
          locale: LOCALE_NS,
          children: sidebarChildren(),
          inject: () => ({
            ...sessionMenuSeat(ctx),
            listPanels: () => readPanels(ctx),
            hasPanelActions: () => ctx.slots.entriesOfSlot('sidebar.panellist.actions').length > 0,
            subscribePanels: (callback: () => void) => {
              const offPanels = ctx.slots.subscribe('sidebar.panellist', callback);
              const offActions = ctx.slots.subscribe('sidebar.panellist.actions', callback);
              return () => {
                offPanels();
                offActions();
              };
            },
            ...workspaceWrites(ctx),
            openWorkspace: (workspaceId: string) => {
              void ctx.uiWorkspace.openWorkspace(workspaceId as WorkspaceId);
            },
            createWorkspace: (path: string) => ctx.workspaces.create({ path }),
            pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
            openSession: (sessionId: string) => ctx.uiWorkspace.openSession(sessionId as SessionTarget),
            startSession: startSessionIn,
            toggleSidebar: () => ctx.layout.toggleSidebar(),
            selectPanel: (panelId: string | null) => ctx.layout.selectPanel(panelId as MainPanelId | null),
            searchSessions,
          }),
        },
        boundaryOf('sidebar', Sidebar),
      ),
    );
  };
  attemptEntry('sidebar', () => bootSidebarEdition(ctx, registerOwnSidebar));
  attemptEntry('sidebar.session.row.leading', () => ctx.slots.inject('sidebar.session.row.leading', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.leading',
        id: 'long-task',
        order: 50,
        locale: LOCALE_NS,
        inject: () => ({ t: ctx.locale.bind(LOCALE_NS) }),
      },
      boundaryOf('sidebar.session.row.leading', LongTaskDot),
    ),
  ));
  attemptEntry('sidebar.session.row.hover', () => ctx.slots.inject('sidebar.session.row.hover', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.hover',
        id: 'long-task',
        order: 50,
        locale: LOCALE_NS,
        inject: () => ({ t: ctx.locale.bind(LOCALE_NS) }),
      },
      boundaryOf('sidebar.session.row.hover', LongTaskHover),
    ),
  ));
  ctx.effect(() => {
    const mirror = (): void => {
      if (runtimeSidebarEdition() !== 'official') return;
      const sessions = ctx.get('sessions');
      if (sessions === undefined) return;
      const current = currentSessionId(sessions.list.getSnapshot(), false);
      const workspace = workspaceOfSession(ctx.workspaces.list.getSnapshot().items, current);
      if (workspace === null) return;
      if (selectedProjectId() !== workspace.workspaceId) selectProject(workspace.workspaceId);
    };
    const sessions = ctx.get('sessions');
    const offWorkspaces = ctx.workspaces.list.subscribe(mirror);
    const offSessions = sessions?.list.subscribe?.(mirror) ?? (() => {});
    const offEdition = subscribeSidebarEdition(mirror);
    return () => {
      offWorkspaces();
      offSessions();
      offEdition();
    };
  }, 'dsh-workbench: 官方左栏选中的项目就是右栏的项目');

  attemptEntry('market-panel', () => registerMarketPanel(ctx, units));
  attemptEntry('market-auto-check', () => {
    ctx.effect(() => startMarketAutoCheck(), 'dsh-workbench: market auto check');
  });
  if (clientSurface().capabilities.debugFooter) attemptEntry('debug-footer', () => registerDebugFooter(ctx));
  attemptEntry('workbench-settings', () => registerWorkbenchSettings(ctx));
  attemptEntry('featured-tab', () => installFeaturedEntry(ctx));
  ctx.effect(() => {
    const workshop = workshopWorkspace();
    if (workshop === undefined) return () => undefined;
    const title = ctx.workspaces.list.getSnapshot().items.find((item) => item.workspaceId === workshop.workspaceId)?.title;
    if (title !== undefined && WORKSHOP_PAST_TITLES.includes(title) && title !== WORKSHOP_TITLE) {
      void ctx.workspaces.rename(workshop.workspaceId as WorkspaceId, WORKSHOP_TITLE).catch((error: unknown) => {
        ctx.logger?.warn?.(
          `[dsh-workbench] 工坊那一行的旧名字没换成「${WORKSHOP_TITLE}」：${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
    return () => undefined;
  }, 'dsh-workbench: 工坊那一行的旧名字换成新名字');

  ctx.effect(
    () => guardedEffect('workshop-preset', () => installWorkshopPreset(ctx)),
    'dsh-workbench: dsh 自己起的工坊空白会话补上 DIY 模式',
  );

  attemptEntry('env-gate', () => {
    const gate = createBootGate(ctx);
    ctx.effect(() => () => gate.close(), 'dsh-workbench: env gate');
  });

  const sessionWorkspacePath = (): string | null => {
    const sessions = ctx.get('sessions');
    if (sessions === undefined) return null;
    const current = currentSessionId(sessions.list.getSnapshot(), false);
    return workspaceOfSession(ctx.workspaces.list.getSnapshot().items, current)?.path ?? null;
  };

  attemptEntry('conversation.approval.detail', () => ctx.slots.inject('conversation.approval.detail', () =>
    ctx.slots.register(
      {
        name: 'conversation.approval.detail',
        priority: -1,
        locale: LOCALE_NS,
        inject: () => ({
          t: ctx.locale.bind(LOCALE_NS),
          units: units.all(),
          renderShell: shellApprovalRenderer(units.declared, sessionWorkspacePath),
        }),
      },
      boundaryOf('conversation.approval.detail', ApprovalDetail),
    ),
  ));

  attemptEntry('conversation.input.dock', () => ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.dock',
        id: 'workbench-flow',
        order: 10,
        locale: LOCALE_NS,
        inject: (session: unknown) => ({
          t: ctx.locale.bind(LOCALE_NS),
          flowSessionId: dockSessionId(session),
        }),
      },
      boundaryOf('conversation.input.dock', FlowProgress),
    ),
  ));

  attemptEntry('conversation.session.header.corner', () => ctx.slots.inject('conversation.session.header.corner', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.corner',
        priority: -1,
        locale: LOCALE_NS,
        inject: () => ({ selectColumn, dshColumn, ...rightbarHooks }),
      },
      boundaryOf('conversation.session.header.corner', ColumnSwitch),
    ),
  ));
}

function sidebarChildren(): ChildrenDecl {
  return {
    'sidebar.brand.mark': { kind: 'single', scope: 'root' },
    'sidebar.brand.name': { kind: 'single', scope: 'root' },
    'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
    'sidebar.panellist.actions': { kind: 'list', scope: 'root' },
    'sidebar.settings': { kind: 'single', scope: 'root' },
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'sidebar.workspaces.session.row.action': { kind: 'list', scope: 'root' },
    'sidebar.session.row.leading': { kind: 'list', scope: 'root' },
    'sidebar.session.row.hover': { kind: 'list', scope: 'root' },
  };
}

export type Kit = typeof kit;
export type { ResourceState } from '@/shared/hooks/use-api-resource';
export type { CardSummary } from '@/shared/hooks/use-card-summary';
export type { CardFeed, UnitBoard } from '@/shared/hooks/use-unit-board';
