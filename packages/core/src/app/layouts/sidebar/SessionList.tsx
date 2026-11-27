import { Fragment, createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { Tip } from '@/shared/components/Tip';
import type {
  DshContextMenuTarget,
  DshMenuPoint,
  DshUseContextMenu,
  RenderSlot,
  SessionId,
  SessionStatusSnapshot,
  SessionsSnapshot,
  SnapshotSelectorHook,
  Translate,
  WorkspaceView,
} from '@dsh-workbench/shared';
import { SESSION_SEARCH_RESULT_LIMIT, currentSessionId, orderSessionRows, scrollEdgesOf, sessionNode, sessionRows, sessionStatuses, type LongTaskPresence, type ScrollEdges, type SessionNode, type SessionSearch, type SessionStatusDot } from '@/modules/sessions';

import { cx, relativeTimeAgo, relativeTimeCompact, useTextMarquee } from '@dsh-workbench/shared';

import { HoverCard, IconEllipsisOutlineRegular, IconPinFillRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';

import { SessionOverflow } from './SessionOverflow';
import { useSessionSearch } from './use-session-search';
import { useSessionWatermark } from './use-session-watermark';
import { SessionSearchResult } from './SessionSearchResult';
import { SessionSearchSkeleton } from './SessionSearchSkeleton';

const REST_EDGES: ScrollEdges = { canScrollUp: false, canScrollDown: false };

function SessionLeading({
  node,
  statuses,
  renderSlot,
}: {
  node: SessionNode;
  statuses: readonly SessionStatusDot[];
  renderSlot: RenderSlot;
}) {
  if (node.blank) return null;
  const primary = statuses[0];
  if (primary === undefined || primary.state === 'idle') {
    return <>{renderSlot('sidebar.session.row.leading', { sessionId: node.id as SessionId })}</>;
  }
  return (
    <>
      <StateDot state={primary.state} />
      {statuses.map((status) => (
        <span className="wb-visuallyHidden" key={status.label}>
          {status.label}
        </span>
      ))}
    </>
  );
}

function SessionHoverContent({
  node,
  statuses,
  renderSlot,
  t,
}: {
  node: SessionNode;
  statuses: readonly SessionStatusDot[];
  renderSlot: RenderSlot;
  t: Translate;
}) {
  return (
    <div className="wb-sessionHover">
      <div className="wb-sessionHoverTitle">{node.blank ? t('session.new') : node.title}</div>
      {node.blank ? null : (
        <div className="wb-sessionHoverTime">{relativeTimeAgo(node.updatedAt, t)}</div>
      )}
      {renderSlot('sidebar.session.row.hover', { sessionId: node.id as SessionId })}
      {statuses.map((status) => (
        <div className="wb-sessionHoverStatus" key={status.label}>
          <StateDot state={status.state} />
          <span>{status.label}</span>
        </div>
      ))}
    </div>
  );
}

function SessionRow({
  node,
  active,
  onOpen,
  openSessionMenu,
  useContextMenu,
  useSessionMenuTarget,
  renderSlot,
  t,
}: {
  node: SessionNode;
  active: boolean;
  onOpen: (sessionId: string) => void;
  openSessionMenu: (sessionId: string, displayTitle: string, point: DshMenuPoint) => void;
  useContextMenu: DshUseContextMenu;
  useSessionMenuTarget: SnapshotSelectorHook<DshContextMenuTarget | null>;
  renderSlot: RenderSlot;
  t: Translate;
}) {
  const menuTrigger = useContextMenu();
  const menuOpen = useSessionMenuTarget(
    (target) => target?.kind === 'session' && target.value.sessionId === node.id,
  );
  const statuses = sessionStatuses(node, t);
  const label = node.blank ? t('session.new') : node.title;
  const titleRef = useRef<HTMLSpanElement>(null);
  const marquee = useTextMarquee(() => titleRef.current);
  const trailing = statuses[0]?.trailingLabel;

  const owner = { sessionId: node.id as SessionId, displayTitle: node.title };
  const menuTarget = { kind: 'session', value: owner } as const;

  return (
    <HoverCard
      anchor={
        <div
          className={cx('wb-sessionRow', active && 'wb-selected', menuOpen && 'wb-menuOpen')}
          role="treeitem"
          aria-selected={active}
          tabIndex={0}
          onClick={() => onOpen(node.id)}
          {...menuTrigger.getTriggerProps(node.blank ? undefined : menuTarget, {
            onKeyDown: (event) => {
              if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
              if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
              event.preventDefault();
              onOpen(node.id);
            },
          })}
          onPointerEnter={marquee.enter}
          onPointerLeave={() => {
            if (!menuOpen) marquee.leave();
          }}
        >
          <span className="wb-sessionLeading">
            <SessionLeading node={node} statuses={statuses} renderSlot={renderSlot} />
          </span>

          <span className="wb-sessionTitle" ref={titleRef}>{label}</span>

          {node.blank ? null : (
            <span
              className="wb-sessionTime"
              aria-hidden={trailing === undefined ? undefined : true}
            >
              {trailing ?? relativeTimeCompact(node.updatedAt, t)}
            </span>
          )}

          {node.pinned ? (
            <Tip label={t('session.pinned')}>
            <span
              className="wb-sessionPin"
              role="img"
              aria-label={t('session.pinned')}
            >
              <IconPinFillRegular size={14} />
            </span>
            </Tip>
          ) : null}

          {node.blank ? null : (
            <span className="wb-rowActions" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="wb-iconButton"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t('session.actions', { name: label })}
                data-context-menu-trigger=""
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  event.currentTarget.focus({ preventScroll: true });
                  const rect = event.currentTarget.getBoundingClientRect();
                  openSessionMenu(node.id, node.title, { x: rect.left, y: rect.bottom });
                }}
              >
                <IconEllipsisOutlineRegular size={16} />
              </button>
              {renderSlot('sidebar.workspaces.session.row.action', owner)}
            </span>
          )}
        </div>
      }
      content={
        <SessionHoverContent node={node} statuses={statuses} renderSlot={renderSlot} t={t} />
      }
      openDelayMs={800}
      disabled={menuOpen}
      copyText={node.blank || node.title === '' ? undefined : node.title}
      copyLabel={t('session.copy')}
      copiedLabel={t('hover.copied')}
    />
  );
}

function useScrollEdges(list: { readonly current: HTMLElement | null }, rows: readonly unknown[]): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>(REST_EDGES);
  useEffect(() => {
    const element = list.current;
    if (element === null) return;
    const sync = (): void => {
      const next = scrollEdgesOf(element);
      setEdges((current) =>
        current.canScrollUp === next.canScrollUp && current.canScrollDown === next.canScrollDown
          ? current
          : next,
      );
    };
    sync();
    element.addEventListener('scroll', sync, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', sync);
      observer?.disconnect();
    };
  }, [list, rows]);
  return edges;
}

export interface SessionListProps {
  workspace: WorkspaceView | null;
  workspaces: readonly WorkspaceView[];
  pinnedIds: readonly string[];
  archived: readonly string[];
  panelActive: boolean;
  longTasks: LongTaskPresence;
  query: string;
  searchSessions: SessionSearch;
  useSessions: SnapshotSelectorHook<SessionsSnapshot>;
  useSessionStatus: SnapshotSelectorHook<SessionStatusSnapshot>;
  useSessionMenuTarget: SnapshotSelectorHook<DshContextMenuTarget | null>;
  useContextMenu: DshUseContextMenu;
  onOpen: (sessionId: string) => void;
  onOpenSearchResult: (sessionId: string) => void;
  openSessionMenu: (sessionId: string, displayTitle: string, point: DshMenuPoint) => void;
  renderSlot: RenderSlot;
  t: Translate;
}

export function SessionList({
  workspace,
  workspaces,
  pinnedIds,
  archived,
  panelActive,
  longTasks,
  query,
  searchSessions,
  useSessions,
  useSessionStatus,
  useSessionMenuTarget,
  useContextMenu,
  onOpen,
  onOpenSearchResult,
  openSessionMenu,
  renderSlot,
  t,
}: SessionListProps) {
  const list = useSessions((state) => state);
  const statusById = useSessionStatus((state) => state);

  const pinned = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const archivedSet = useMemo(() => new Set(archived), [archived]);

  const currentId = currentSessionId(list, panelActive);
  const rows = useMemo(() => {
    if (workspace === null) return [];
    return orderSessionRows(sessionRows(workspace.sessionIds, list, archivedSet, currentId), pinned, archivedSet);
  }, [workspace, list, archivedSet, currentId, pinned]);

  const workspaceId = workspace?.workspaceId;
  const watermark = useSessionWatermark({
    workspaceId,
    rows,
    currentId,
    statusById,
    list,
    pinned,
    archivedSet,
    longTasks,
  });
  const search = useSessionSearch({
    workspaceId,
    query,
    workspaces,
    list,
    archivedSet,
    searchSessions,
  });
  const shownRows = search.searching ? search.rows : watermark.visible.rows;

  const listRef = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(listRef, shownRows);

  if (workspace === null) return <div className="wb-empty">{t('session.noProject')}</div>;
  if (rows.length === 0 && !search.searching) return <div className="wb-empty">{t('session.empty')}</div>;

  return (
    <div
      ref={listRef}
      className={cx('wb-sessions', edges.canScrollUp && 'wb-fadeTop', edges.canScrollDown && 'wb-fadeBottom')}
      role="tree"
      aria-label={search.searching ? t('session.search.results') : t('session.list.label')}
    >
      {search.searching
        ? search.hits.hits.map((hit) => (
            <SessionSearchResult
              key={hit.row.id}
              node={sessionNode(
                hit.row,
                statusById,
                list,
                pinned,
                archivedSet,
                longTasks.bySession,
                longTasks.waitingBySession,
              )}
              workspace={hit.workspace}
              snippet={hit.snippet}
              active={hit.row.id === currentId}
              onOpen={onOpenSearchResult}
              t={t}
            />
          ))
        : shownRows.map((row) => {
            const node = watermark.nodesById.get(row.id);
            if (node === undefined) return null;
            return (
              <SessionRow
                key={row.id}
                node={node}
                active={row.id === currentId}
                onOpen={onOpen}
                openSessionMenu={openSessionMenu}
                useContextMenu={useContextMenu}
                useSessionMenuTarget={useSessionMenuTarget}
                renderSlot={renderSlot}
                t={t}
              />
            );
          })}
      {search.searching ? (
        <>
          {search.pending ? (
            <div role="status" aria-label={t('session.search.pending')}>
              <SessionSearchSkeleton rows={search.hits.hits.length === 0 ? 2 : 1} />
            </div>
          ) : null}
          {!search.pending && search.hits.hits.length === 0 ? (
            <div className="wb-empty" role="status">{t('session.search.empty')}</div>
          ) : null}
          {!search.pending && search.hits.hasMore ? (
            <div className="wb-empty">{t('session.search.hasMore', { n: SESSION_SEARCH_RESULT_LIMIT })}</div>
          ) : null}
        </>
      ) : watermark.expandedAll || watermark.visible.hiddenCount > 0 ? (
        <SessionOverflow
          hiddenCount={watermark.visible.hiddenCount}
          expanded={watermark.expandedAll}
          onExpand={watermark.expand}
          onCollapse={watermark.collapse}
          t={t}
        />
      ) : null}
    </div>
  );
}
