import '@/shared/dev-surface/install';
import type { DshClientContext, PanelEntry } from '@dsh-workbench/shared';
import type { PanelStep } from '@dsh-workbench/shared';
import { LOCALE_NS, UNITS_SERVICE } from '@dsh-workbench/shared';
import { MARKET_PANEL_ID, registerMarketPanel } from '@/app/layouts/market/panel';
import { registerDebugFooter } from '@/app/layouts/sidebar/debug-footer';
import { clientSurface } from '@/shared/api/platform/client';
import { registerRecordFooter } from '@/app/layouts/sidebar/record-footer';
import { WorkbenchSettingsSection } from '@/app/layouts/workbench-settings/WorkbenchSettingsSection';
import { selectProject, selectedProjectId } from '@/app/layouts/project-selection';
import { WORKSHOP_PAST_TITLES, WORKSHOP_TITLE, diyStartOptions, isWorkshopPath } from '@/shared/api/diy';
import { installWorkshopPreset } from '@/app/layouts/sidebar/workshop-preset';
import type { MessagesContribution } from '@dsh-workbench/shared';
import { assembleClientUnits } from '@/app/units';
import { createClientUnitRegistry } from '@/kernel/client/registry';
import { createUnitManifestLoader } from '@/app/units/manifests';
import type { UnitClientApi, UnitClientFace } from '@dsh-workbench/shared';
import { createBootGate } from '@/app/layouts/env-gate/boot-gate';
import { shellApprovalDetail } from '@/app/layouts/approval-detail';
import { ColumnSwitch } from '@/app/layouts/rightbar/ColumnSwitch';
import { createDshColumnSource, DSH_COLUMN_POLL_MS } from '@/app/layouts/rightbar/dsh-column-source';
import { createDshBorrow } from '@/app/layouts/rightbar/dsh-borrow';
import { Tip } from '@/shared/components/Tip';
import { Rightbar } from '@/app/layouts/rightbar/Rightbar';
import { installContextChips } from '@/shared/api/context-chips';
import { installWorkbenchStyles } from '@/app/layouts/workbench-styles';
import { currentSessionId, workspaceOfSession } from '@/modules/sessions';
import type { DshSessionsService, DshSidebarRight } from '@dsh-workbench/shared';
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
import { LongTaskHover } from '@/app/layouts/sidebar/LongTaskHover';
import rightbarCss from '@/shared/styles/rightbar.css?raw';
import tokensCss from '@/shared/styles/tokens.css?raw';
import paletteCss from '@/shared/styles/tokens/palette.css?raw';
import scaleCss from '@/shared/styles/tokens/scale.css?raw';
import sidebarAppCss from '@/shared/styles/sidebar-app.css?raw';
import sidebarCss from '@/shared/styles/sidebar.css?raw';
import chromeCss from '@/shared/styles/chrome.css?raw';
import boardCss from '@/shared/styles/board.css?raw';
import motionCss from '@/shared/styles/motion.css?raw';
import * as chipsModule from '@/shared/api/context-chips';
import * as apiResourceModule from '@/shared/hooks/use-api-resource';
import * as cardSummaryModule from '@/shared/hooks/use-card-summary';
import * as factsModule from '@/shared/hooks/use-facts';
import * as hostWriteModule from '@/shared/hooks/use-host-write';
import * as longTaskModule from '@/shared/hooks/use-long-task';
import * as capabilityGateModule from '@/shared/hooks/use-capability-gate';
import * as unitBoardModule from '@/shared/hooks/use-unit-board';
import * as visibleBusyModule from '@/shared/hooks/use-visible-busy';
import * as blockerStateModule from '@/shared/components/BlockerState';
import {
  ActivityAction, ActivityBlock, ActivityLine, ApprovalDetail, ApprovalPlan, Card, CardAnchor, CardBoundary,
  CardHead, CenteredState, ChoiceGroup, ConfirmBar, EmptyState, Field, Form, FormActions, FormRow, FormRows,
  IconBrandMark, IconConversation, IconModuleMark, IconNpm, IconOpencli, IconPanelScreen, Link, LongTaskRow,
  longTaskIsLive,
  MIN_BUSY_MS, Note, Row, Rows, SaveBar, SelectField, SettingsSection, SkeletonRows, Spinner, Stack,
  StateBlock, TextField, apiGet, apiPost, blockerOfCapability, blockerOfError, cardIdOf, cx,
  defaultSelectFilter, dictionaries, duplicateKeysOf, errorReasonOf, excerpt, factOfRoute, filterSelectOptions,
  firstProblemOf, formFirstProblemOf, formValuesOf, holdBusy, mergeMessagesSkipping, parseJsonLoose,
  parseLocalTimestamp, readText, relativeTime, relativeTimeAgo, relativeTimeBucket, relativeTimeCompact,
  revealFirstProblem, searchTextOf, selectCursorValue, selectEntries, shortenPath, stepSelectCursor,
  writeText,
} from '@dsh-workbench/shared';

export const kit = {
  hooks: {
    ...apiResourceModule,
    ...cardSummaryModule,
    ...factsModule,
    ...hostWriteModule,
    ...longTaskModule,
    ...capabilityGateModule,
    ...unitBoardModule,
    ...visibleBusyModule,
  },
  components: {
    ...blockerStateModule,
    ActivityAction, ActivityBlock, ActivityLine, ApprovalDetail, ApprovalPlan, Card, CardAnchor,
    CardBoundary, CardHead, CenteredState, ChoiceGroup, ConfirmBar, EmptyState, Field, Form, FormActions, FormRow,
    FormRows, IconBrandMark, IconConversation, IconModuleMark, IconNpm, IconOpencli, IconPanelScreen, Link,
    LongTaskRow, Note, Row, Rows, SaveBar, SelectField, SettingsSection, SkeletonRows, Spinner, Stack,
    StateBlock, TextField, Tip, },

  api: { apiGet, apiPost, factOfRoute, ...chipsModule },
  lib: {
    longTaskIsLive,
    MIN_BUSY_MS, blockerOfCapability, blockerOfError, cardIdOf, cx, defaultSelectFilter, duplicateKeysOf,
    errorReasonOf, excerpt, filterSelectOptions, firstProblemOf, formFirstProblemOf, formValuesOf, holdBusy,
    parseJsonLoose, parseLocalTimestamp, readText, relativeTime, relativeTimeAgo, relativeTimeBucket,
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

const COMPONENT_CSS_MARKER = '@@WB_MODULE_CSS@@';

function workbenchCss(): string {
  return `${tokensCss}\n${paletteCss}\n${scaleCss}\n${sidebarCss}\n${sidebarAppCss}\n${rightbarCss}\n${chromeCss}\n${boardCss}\n${motionCss}\n${COMPONENT_CSS_MARKER}`;
}

const rightbarStore = createRightbarStore();

type RightbarObservable = {
  getSnapshot(): RightbarState;
  subscribe(listener: () => void): () => void;
};

function readPanels(ctx: DshClientContext): PanelEntry[] {
  return ctx.slots
    .entriesOfSlot('sidebar.panellist')
    .map(({ options }) => ({
      id: options.id ?? options.name,
      order: options.order ?? 0,
      label: options.label ?? options.id ?? options.name,
    }))
    .sort((a, b) => a.order - b.order);
}

export const inject = ['slots', 'locale', 'layout', 'uiWorkspace', 'workspaces', 'shortcuts', 'remote'];

export function apply(ctx: DshClientContext): void {
  try {
    mount(ctx);
  } catch (error) {
    console.error('[dsh-workbench] apply failed', error);
    throw error;
  }
}

function mount(ctx: DshClientContext): void {
  const loadUnitManifests = createUnitManifestLoader();
  const units = createClientUnitRegistry({ onUnknownUnit: () => loadUnitManifests(units) });
  ctx.provide(UNITS_SERVICE, {
    registerUnit: (face: UnitClientFace) => units.register(face),
    manifests: () => units.manifests(),
  } satisfies UnitClientApi);
  assembleClientUnits(units);
  loadUnitManifests(units);
  const store = rightbarStore;
  const observable: RightbarObservable = {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => store.subscribe(listener),
  };

  installWorkbenchStyles(workbenchCss());

  installContextChips(ctx, {
    currentSessionId: () => {
      const sessions = ctx.get<DshSessionsService>('sessions');
      const snapshot = sessions?.list.getSnapshot();
      return snapshot === undefined ? undefined : currentSessionId(snapshot, false);
    },
  });
  ctx.effect(() => {
    let disposeDictionary: (() => void) | undefined;
    const publish = (): void => {
      disposeDictionary?.();
      const { dictionaries: merged, problems } = mergeMessagesSkipping(dictionaries, messagesOf(units.all()));
      for (const problem of problems) {
        console.warn(`[dsh-workbench] 套件 ${problem.unit} 的文案没并进来（只有它少了这几句）：${problem.reason}`);
      }
      disposeDictionary = ctx.locale.register(LOCALE_NS, merged);
    };
    publish();
    const unsubscribe = units.subscribe(publish);
    return () => {
      unsubscribe();
      disposeDictionary?.();
    };
  }, 'dsh-workbench: dictionaries');

  const workshopWorkspace = () =>
    ctx.workspaces.list.getSnapshot().items.find((item) => isWorkshopPath(item.path));

  const startSessionIn = (workspaceId: string): void => {
    const options = diyStartOptions(workspaceId, workshopWorkspace()?.workspaceId);
    if (options === undefined) ctx.uiWorkspace.startSession(workspaceId);
    else ctx.uiWorkspace.startSession(workspaceId, options);
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

  restoreRightbarWidth(ctx.layout.panels);
  let rightbarWidthSeeded = false;
  const seedWidthOnce = (): void => {
    if (rightbarWidthSeeded) return;
    rightbarWidthSeeded = true;
    seedRightbarWidth(ctx.layout.panels);
  };
  ctx.effect(() => () => releaseRightbarWidthMemory(ctx.layout.panels), 'dsh-workbench: 记住右栏宽度');

  const rightbarActions = {
    openMarket: () => ctx.layout.selectPanel(MARKET_PANEL_ID),
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

  const sidebarRight = (): DshSidebarRight | undefined => ctx.get<DshSidebarRight>('sidebarRight');

  let workbenchColumnArmed = false;
  let disposeWorkbenchColumn: (() => void) | undefined;

  const armWorkbenchColumn = (): void => {
    if (workbenchColumnArmed) return;
    workbenchColumnArmed = true;
    disposeWorkbenchColumn = ctx.slots.inject('rightbar', () =>
      ctx.slots.register(
        { name: 'rightbar', priority: -1, locale: LOCALE_NS, inject: () => ({ ...rightbarActions, ...rightbarHooks, units }) },
        Rightbar,
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

  borrow.start();

  if (store.getSnapshot().column === 'workbench') armWorkbenchColumn();

  let ownSidebarRegistered = false;
  const registerOwnSidebar = (): void => {
    if (ownSidebarRegistered) return;
    ownSidebarRegistered = true;
    ctx.slots.inject('sidebar', () =>
      ctx.slots.register(
        {
          name: 'sidebar',
          priority: -1,
          locale: LOCALE_NS,
          children: sidebarChildren(ctx),
          inject: () => ({
            listPanels: () => readPanels(ctx),
            subscribePanels: (callback: () => void) => ctx.slots.subscribe('sidebar.panellist', callback),
            renameWorkspace: async (workspaceId: string, title: string) => {
              try {
                await ctx.workspaces.rename(workspaceId, title);
                return true;
              } catch {
                return false;
              }
            },
            openWorkspace: (workspaceId: string) => {
              void ctx.uiWorkspace.openWorkspace(workspaceId);
            },
            createWorkspace: (path: string) => ctx.workspaces.create({ path }),
            pickDirectory: () => ctx.uiWorkspace.pickDirectory(),
            openSession: (sessionId: string) => ctx.uiWorkspace.openSession(sessionId),
            startSession: startSessionIn,
            toggleSidebar: () => ctx.layout.toggleSidebar(),
            selectPanel: (panelId: string | null) => ctx.layout.selectPanel(panelId),
          }),
        },
        Sidebar,
      ),
    );
  };
  bootSidebarEdition(ctx, registerOwnSidebar);
  ctx.slots.inject('sidebar.session.row.leading', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.leading',
        id: 'long-task',
        order: 50,
        locale: LOCALE_NS,
        inject: () => ({ t: ctx.locale.bind(LOCALE_NS) }),
      },
      LongTaskDot,
    ),
  );
  ctx.slots.inject('sidebar.session.row.hover', () =>
    ctx.slots.register(
      {
        name: 'sidebar.session.row.hover',
        id: 'long-task',
        order: 50,
        locale: LOCALE_NS,
        inject: () => ({ t: ctx.locale.bind(LOCALE_NS) }),
      },
      LongTaskHover,
    ),
  );
  ctx.effect(() => {
    const mirror = (): void => {
      if (runtimeSidebarEdition() !== 'official') return;
      const sessions = ctx.get<DshSessionsService>('sessions');
      if (sessions === undefined) return;
      const current = currentSessionId(sessions.list.getSnapshot(), false);
      const workspace = workspaceOfSession(ctx.workspaces.list.getSnapshot().items, current);
      if (workspace === null) return;
      if (selectedProjectId() !== workspace.workspaceId) selectProject(workspace.workspaceId);
    };
    const sessions = ctx.get<DshSessionsService>('sessions');
    const offWorkspaces = ctx.workspaces.list.subscribe(mirror);
    const offSessions = sessions?.list.subscribe?.(mirror) ?? (() => {});
    const offEdition = subscribeSidebarEdition(mirror);
    return () => {
      offWorkspaces();
      offSessions();
      offEdition();
    };
  }, 'dsh-workbench: 官方左栏选中的项目就是右栏的项目');

  registerMarketPanel(ctx, units);
  if (clientSurface().capabilities.debugFooter) registerDebugFooter(ctx);
  registerRecordFooter(ctx);
  registerWorkbenchSettingsSection(ctx);
  ctx.effect(() => {
    const workshop = workshopWorkspace();
    if (workshop === undefined) return;
    const title = ctx.workspaces.list.getSnapshot().items.find((item) => item.workspaceId === workshop.workspaceId)?.title;
    if (title !== undefined && WORKSHOP_PAST_TITLES.includes(title) && title !== WORKSHOP_TITLE) {
      void ctx.workspaces.rename(workshop.workspaceId, WORKSHOP_TITLE).catch(() => undefined);
    }
  }, 'dsh-workbench: 工坊那一行的旧名字换成新名字');

  ctx.effect(
    () => installWorkshopPreset(ctx),
    'dsh-workbench: dsh 自己起的工坊空白会话补上 DIY 模式',
  );

  const gate = createBootGate(ctx);
  ctx.effect(() => () => gate.close(), 'dsh-workbench: env gate');

  ctx.slots.inject('conversation.approval.detail', () =>
    ctx.slots.register(
      {
        name: 'conversation.approval.detail',
        priority: -1,
        locale: LOCALE_NS,
        inject: () => ({
          t: ctx.locale.bind(LOCALE_NS),
          units: units.all(),
          renderShell: shellApprovalDetail,
        }),
      },
      ApprovalDetail,
    ),
  );

  ctx.slots.inject('conversation.session.header.corner', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.corner',
        priority: -1,
        locale: LOCALE_NS,
        inject: () => ({ selectColumn, dshColumn, ...rightbarHooks }),
      },
      ColumnSwitch,
    ),
  );
}

const WORKBENCH_SETTINGS_SECTION_ID = 'workbench-settings';

function registerWorkbenchSettingsSection(ctx: DshClientContext): void {
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: WORKBENCH_SETTINGS_SECTION_ID,
        order: 40,
        locale: LOCALE_NS,
        label: () => ctx.locale.bind(LOCALE_NS)('workbenchSettings.nav'),
        inject: () => ({ t: ctx.locale.bind(LOCALE_NS) }),
      },
      WorkbenchSettingsSection,
    ),
  );
}

function sidebarChildren(ctx: DshClientContext) {
  return {
    'sidebar.brand.mark': { kind: 'single', scope: 'root' },
    'sidebar.brand.name': { kind: 'single', scope: 'root' },
    'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
    'sidebar.panellist': { kind: 'list', scope: 'root' },
    'sidebar.settings': { kind: 'single', scope: 'root' },
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'sidebar.workspaces.session.menu.item': {
      kind: 'list',
      scope: 'root',
      inject: { hooks: { menuOpenState: menuOpenStateFactory, shortcuts: ctx.shortcuts.catalog } },
    },
    'sidebar.workspaces.session.row.action': { kind: 'list', scope: 'root' },
    'sidebar.session.row.leading': { kind: 'list', scope: 'root' },
    'sidebar.session.row.hover': { kind: 'list', scope: 'root' },
  };
}

function menuOpenStateFactory(_standard: unknown, state: unknown) {
  return () => state;
}

export type Kit = typeof kit;
export type { ResourceState } from '@/shared/hooks/use-api-resource';
export type { CardSummary } from '@/shared/hooks/use-card-summary';
export type { CardFeed, UnitBoard } from '@/shared/hooks/use-unit-board';
