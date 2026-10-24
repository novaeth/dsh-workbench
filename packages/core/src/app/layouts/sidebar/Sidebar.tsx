import { Fragment, createElement as h, useEffect, useState } from 'react';
import { Spinner } from '@dsh-workbench/shared';
import type {
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
import { openNewSession, openPickedProject } from './session-pick';
import { SidebarHeader } from './SidebarHeader';
import { WorkspaceSection } from './WorkspaceSection';
import { useSidebarAttention, useLongTaskPresence } from './use-attention';
import { cx } from '@dsh-workbench/shared';

import { PanelRow } from './PanelNav';
import { ProjectSwitcher } from './ProjectSwitcher';
import { SessionList } from './SessionList';

export interface SidebarActions {
  listPanels: () => PanelEntry[];
  subscribePanels: (callback: () => void) => () => void;
  renameWorkspace: (workspaceId: string, title: string) => Promise<boolean>;
  openWorkspace: (workspaceId: string) => void;
  createWorkspace: (path: string) => Promise<{ workspaceId?: string } | undefined>;
  pickDirectory: () => Promise<string | null>;
  openSession: (sessionId: string) => void;
  startSession: (workspaceId: string) => void;
  toggleSidebar: () => void;
  selectPanel: (panelId: string | null) => void;
}

export type SidebarProps = SidebarActions & {
  collapsed: boolean;
  renderSlot: RenderSlot;
  t: Translate;
  useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>;
  usePanelInfo: SnapshotSelectorHook<PanelInfo>;
  useSessions: SnapshotSelectorHook<SessionsSnapshot>;
  useSessionStatus: SnapshotSelectorHook<SessionStatusSnapshot>;
};

function panelLabel(entry: PanelEntry): string {
  return typeof entry.label === 'function' ? entry.label() : entry.label;
}

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

  const items = useWorkspaces((state) => state.items);
  const archived = useWorkspaces((state) => state.archivedSessionIds);
  const pinnedIds = useWorkspaces((state) => state.pinnedSessionIds);
  const activePanelId = usePanelInfo((state) => state.activePanelId);
  const sessions = props.useSessions((state) => state);
  const statusById = props.useSessionStatus((state) => state);
  const board = useBoardWorkspace({ items, archivedSessionIds: archived, pinnedSessionIds: pinnedIds }, sessions);

  const [storedId, setStoredId] = useState(() => selectedProjectId());
  const [panelEntries, setPanelEntries] = useState<PanelEntry[]>(() => props.listPanels());
  const [creating, setCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  useEffect(() => props.subscribePanels(() => setPanelEntries(props.listPanels())), [props]);

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

      <nav className="wb-panelList" aria-label={t('panels.label')}>
        {panelEntries.map((entry) => (
          <PanelRow
            key={entry.id}
            id={entry.id}
            label={panelLabel(entry)}
            active={activePanelId === entry.id}
            wide={wide}
            onSelect={props.selectPanel}
            t={t}
            renderEntry={(id, active, isWide) =>
              renderSlot('sidebar.panellist', { size: isWide ? 16 : 18, active }, { only: id })
            }
          />
        ))}
      </nav>

      {wide ? (
        <>
        <ProjectSwitcher
          items={items}
          current={current}
          attention={attention}
          onPick={pickProject}
          onAdd={addProject}
          onRename={props.renameWorkspace}
          t={t}
        />
        {creating ? (
          <p className="wb-workspaceBusy" role="status">
            <Spinner size={12} />
            {t('project.add.busy')}
          </p>
        ) : null}
        {createFailed ? <p className="wb-workspaceError">{t('project.add.failed')}</p> : null}
        </>
      ) : (
        <ProjectSwitcher
          items={items}
          current={current}
          attention={attention}
          compact
          onPick={pickProject}
          onAdd={addProject}
          onRename={props.renameWorkspace}
          t={t}
        />
      )}
      <WorkspaceSection
        t={t}
        wide={wide}
        onNewSession={() => {
          const { openSession, startSession } = props;
          openNewSession({ workspace: current, sessions, archivedIds: archivedSet, openSession, startSession });
        }}
      />
      <div className="wb-regionArea">
        {wide ? (
          <SessionList
            workspace={current}
            pinnedIds={pinnedIds}
            archived={archived}
            panelActive={activePanelId !== null}
            longTasks={longTasks}
            useSessions={props.useSessions}
            useSessionStatus={props.useSessionStatus}
            onOpen={props.openSession}
            renderSlot={renderSlot}
            t={t}
          />
        ) : null}
      </div>

      <div className="wb-footArea">
        <div className="wb-footerActions">{renderSlot('sidebar.footer.action', { wide })}</div>
        <div className="wb-settingsArea">{renderSlot('sidebar.settings', { wide })}</div>
      </div>
    </div>
  );
}
