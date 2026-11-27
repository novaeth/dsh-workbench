import { createElement as h, useEffect, useMemo, useState } from 'react';
import { Spinner } from '@dsh-workbench/shared';
import type {
  DshContextMenuTarget,
  DshMenuPoint,
  DshUseContextMenu,
  PanelEntry,
  PanelInfo,
  RenderSlot,
  SessionStatusSnapshot,
  SessionsSnapshot,
  SnapshotSelectorHook,
  Translate,
  WorkspaceSnapshot,
} from '@dsh-workbench/shared';
import { selectProject, selectedProjectId, subscribeProject } from '@/app/layouts/project-selection';
import { useBoardWorkspace } from '@/app/layouts/rightbar/use-panels';
import type { SessionSearch } from '@/modules/sessions';
import { openNewSession, openPickedProject, openWorkspaceByPath } from './session-pick';
import { SidebarHeader } from './SidebarHeader';
import { WorkspaceSection } from './WorkspaceSection';
import { useSidebarAttention, useLongTaskPresence } from './use-attention';
import { useSidebarSearch } from './use-sidebar-search';
import { usePanelEntries } from './use-panel-entries';
import { workspaceRecencyOf } from './workspace-recency';
import { cx } from '@dsh-workbench/shared';

import { PanelList } from './PanelNav';
import { LongTaskFooterAction } from './LongTaskFooterAction';
import { usePlatform } from '@/shared/hooks/use-platform';
import { ProjectSwitcher } from './ProjectSwitcher';
import { SessionList } from './SessionList';

export interface SidebarActions {
  listPanels: () => PanelEntry[];
  hasPanelActions: () => boolean;
  subscribePanels: (callback: () => void) => () => void;
  renameWorkspace: (workspaceId: string, title: string) => Promise<boolean>;
  deleteWorkspace: (workspaceId: string) => Promise<boolean>;
  revealWorkspace: (path: string) => void;
  openWorkspace: (workspaceId: string) => void;
  createWorkspace: (path: string) => Promise<{ workspaceId?: string } | undefined>;
  pickDirectory: () => Promise<string | null>;
  openSession: (sessionId: string) => void;
  startSession: (workspaceId: string) => void;
  toggleSidebar: () => void;
  selectPanel: (panelId: string | null) => void;
  openSessionMenu: (sessionId: string, displayTitle: string, point: DshMenuPoint) => void;
}

export type SidebarProps = SidebarActions & {
  collapsed: boolean;
  renderSlot: RenderSlot;
  t: Translate;
  useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>;
  usePanelInfo: SnapshotSelectorHook<PanelInfo>;
  useSessions: SnapshotSelectorHook<SessionsSnapshot>;
  useSessionStatus: SnapshotSelectorHook<SessionStatusSnapshot>;
  useSessionMenuTarget: SnapshotSelectorHook<DshContextMenuTarget | null>;
  useContextMenu: DshUseContextMenu;
  searchSessions: SessionSearch;
};

function addWorkspace(input: {
  readonly add: SidebarActions['pickDirectory'];
  readonly create: SidebarActions['createWorkspace'];
  readonly onBusy: (busy: boolean) => void;
  readonly onFailed: (failed: boolean) => void;
  readonly onCreated: (workspaceId: string) => void;
}): void {
  void input
    .add()
    .catch(() => null)
    .then((path) => {
      if (path === null || path === '') return;
      input.onBusy(true);
      input.onFailed(false);
      void input
        .create(path)
        .catch(() => undefined)
        .then((view) => {
          input.onBusy(false);
          if (view?.workspaceId === undefined) {
            input.onFailed(true);
            return;
          }
          input.onCreated(view.workspaceId);
        });
    });
}

export function Sidebar(props: SidebarProps) {
  const { collapsed, renderSlot, t, useWorkspaces, usePanelInfo } = props;
  const platform = usePlatform();

  const items = useWorkspaces((state) => state.items);
  const archived = useWorkspaces((state) => state.archivedSessionIds);
  const pinnedIds = useWorkspaces((state) => state.pinnedSessionIds);
  const activePanelId = usePanelInfo((state) => state.activePanelId);
  const sessions = props.useSessions((state) => state);
  const statusById = props.useSessionStatus((state) => state);
  const board = useBoardWorkspace({ items, archivedSessionIds: archived, pinnedSessionIds: pinnedIds }, sessions);

  const [storedId, setStoredId] = useState(() => selectedProjectId());
  const [panelEntries, hasPanelActions] = usePanelEntries(props);
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  useEffect(() => subscribeProject(() => setStoredId(selectedProjectId())), []);

  const longTasks = useLongTaskPresence();

  const { current, archivedIds: archivedSet, attention } = useSidebarAttention({
    items,
    sessions,
    statusById,
    archived,
    storedId,
    panelActive: activePanelId !== null,
    longTasks,
  });

  const search = useSidebarSearch(props.openSession);

  const recency = useMemo(
    () => workspaceRecencyOf({ items, sessions, archivedIds: archivedSet }),
    [items, sessions, archivedSet],
  );

  const pickProject = (workspaceId: string) => {
    setStoredId(workspaceId);
    selectProject(workspaceId);
    const { openSession, startSession } = props;
    openPickedProject({ workspaceId, items, sessions, statusById, archivedIds: archivedSet, longTasks, openSession, startSession });
  };

  const addProject = () => {
    addWorkspace({
      add: props.pickDirectory,
      create: props.createWorkspace,
      onBusy: setCreating,
      onFailed: setCreateFailed,
      onCreated: pickProject,
    });
  };

  const wide = !collapsed;

  return (
    <div className={cx('wb-root', collapsed && 'wb-collapsed')} data-wb-where={board.path ?? undefined}>
      <SidebarHeader
        collapsed={collapsed}
        wide={wide}
        attention={attention.overall}
        t={t}
        renderSlot={renderSlot}
        onToggle={props.toggleSidebar}
        onSelectPanel={props.selectPanel}
      />

      <PanelList
        entries={panelEntries}
        hasActions={hasPanelActions}
        activePanelId={activePanelId}
        wide={wide}
        onSelect={props.selectPanel}
        renderSlot={renderSlot}
        t={t}
      />

      <ProjectSwitcher
        items={items}
        current={current}
        attention={attention}
        recency={recency}
        compact={!wide}
        onPick={pickProject}
        onAdd={addProject}
        onAlias={props.renameWorkspace}
        onDelete={props.deleteWorkspace}
        onReveal={props.revealWorkspace}
        fileManager={platform.host?.capabilities.fileManager ?? 'none'}
        t={t}
      />
      {wide && creating ? (
        <p className="wb-workspaceBusy" role="status">
          <Spinner size={12} />
          {t('project.add.busy')}
        </p>
      ) : null}
      {wide && createFailed ? <p className="wb-workspaceError">{t('project.add.failed')}</p> : null}
      <WorkspaceSection
        t={t}
        wide={wide}
        search={search}
        onNewSession={() => {
          const { openSession, startSession } = props;
          openNewSession({ workspace: current, sessions, archivedIds: archivedSet, openSession, startSession });
        }}
      />
      <div className="wb-regionArea">
        {wide ? (
          <SessionList
            workspace={current}
            workspaces={items}
            pinnedIds={pinnedIds}
            archived={archived}
            panelActive={activePanelId !== null}
            longTasks={longTasks}
            query={search.query}
            searchSessions={props.searchSessions}
            useSessions={props.useSessions}
            useSessionStatus={props.useSessionStatus}
            onOpen={props.openSession}
            onOpenSearchResult={search.openResult}
            openSessionMenu={props.openSessionMenu}
            useContextMenu={props.useContextMenu}
            useSessionMenuTarget={props.useSessionMenuTarget}
            renderSlot={renderSlot}
            t={t}
          />
        ) : null}
      </div>

      <div className="wb-footArea">
        <div className="wb-footerActions">
          {h(LongTaskFooterAction, {
            wide,
            t,
            pickWorkspacePath: (path) => openWorkspaceByPath(items, path, pickProject),
          })}
          {renderSlot('sidebar.footer.action', { wide })}
        </div>
        <div className="wb-settingsArea">{renderSlot('sidebar.settings', { wide })}</div>
      </div>
    </div>
  );
}
