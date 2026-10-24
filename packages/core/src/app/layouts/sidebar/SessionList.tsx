import { Fragment, createElement as h, useEffect, useMemo, useRef, useState } from 'react';
import { Tip } from '@/shared/components/Tip';
import type {
  RenderSlot,
  SessionStatusSnapshot,
  SessionsSnapshot,
  SnapshotSelectorHook,
  Translate,
  WorkspaceView,
} from '@dsh-workbench/shared';
import { currentSessionId, orderSessionRows, scrollEdgesOf, sessionNode, sessionRows, sessionStatuses, type LongTaskPresence, type ScrollEdges, type SessionNode, type SessionStatusDot } from '@/modules/sessions';

import { cx, relativeTimeAgo, relativeTimeCompact } from '@dsh-workbench/shared';

import { HoverCard, IconEllipsisOutlineRegular, IconPinFillRegular, Menu, StateDot } from '@deepseek-ai/dsh-client-ui-primitives';

const MIN_TITLE_REVEAL_PX = 8;
const TITLE_MARQUEE_PX_PER_MS = 0.03;

const REST_EDGES: ScrollEdges = { canScrollUp: false, canScrollDown: false };

function placeTitle(title: HTMLElement, left: number, range: number): void {
  title.scrollTo({ left, behavior: 'instant' });
  if (left > 0) title.dataset.scrolled = '';
  else delete title.dataset.scrolled;
  if (left < range) title.dataset.clipped = '';
  else delete title.dataset.clipped;
}

function restTitle(title: HTMLElement): void {
  title.scrollTo({ left: 0, behavior: 'instant' });
  delete title.dataset.scrolled;
  delete title.dataset.clipped;
}

function useTitleMarquee(title: { readonly current: HTMLElement | null }) {
  const frame = useRef(0);
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
    },
    [],
  );
  return useMemo(
    () => ({
      enter: () => {
        const element = title.current;
        if (element === null) return;
        const range = element.scrollWidth - element.clientWidth;
        if (range <= MIN_TITLE_REVEAL_PX) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          placeTitle(element, range, range);
          return;
        }
        cancelAnimationFrame(frame.current);
        let previous: number | undefined;
        let position = 0;
        const step = (now: number): void => {
          position += previous === undefined ? 0 : (now - previous) * TITLE_MARQUEE_PX_PER_MS;
          previous = now;
          placeTitle(element, Math.min(position, range), range);
          if (position < range) frame.current = requestAnimationFrame(step);
        };
        frame.current = requestAnimationFrame(step);
      },
      leave: () => {
        cancelAnimationFrame(frame.current);
        const element = title.current;
        if (element === null) return;
        restTitle(element);
      },
    }),
    [title],
  );
}

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
    return <>{renderSlot('sidebar.session.row.leading', { sessionId: node.id })}</>;
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
      {renderSlot('sidebar.session.row.hover', { sessionId: node.id })}
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
  renderSlot,
  t,
}: {
  node: SessionNode;
  active: boolean;
  onOpen: (sessionId: string) => void;
  renderSlot: RenderSlot;
  t: Translate;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuState = useMemo(() => [menuOpen, setMenuOpen], [menuOpen]);
  const statuses = sessionStatuses(node, t);
  const label = node.blank ? t('session.new') : node.title;
  const titleRef = useRef<HTMLSpanElement>(null);
  const marquee = useTitleMarquee(titleRef);
  const trailing = statuses[0]?.trailingLabel;

  const owner = { sessionId: node.id, displayTitle: node.title };

  return (
    <HoverCard
      anchor={
        <div
          className={cx('wb-sessionRow', active && 'wb-selected', menuOpen && 'wb-menuOpen')}
          role="treeitem"
          aria-selected={active}
          onClick={() => onOpen(node.id)}
          onPointerEnter={marquee.enter}
          onPointerLeave={marquee.leave}
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
              <Menu
                open={menuOpen}
                portal
                closeOnPointerLeave
                anchor={
                  <button
                    type="button"
                    className="wb-iconButton"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    aria-label={t('session.actions', { name: label })}
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuOpen((value) => !value);
                    }}
                  >
                    <IconEllipsisOutlineRegular size={16} />
                  </button>
                }
                onClose={() => setMenuOpen(false)}
              >
                {renderSlot('sidebar.workspaces.session.menu.item', owner, { hookContext: menuState })}
              </Menu>
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
  pinnedIds: readonly string[];
  archived: readonly string[];
  panelActive: boolean;
  longTasks: LongTaskPresence;
  useSessions: SnapshotSelectorHook<SessionsSnapshot>;
  useSessionStatus: SnapshotSelectorHook<SessionStatusSnapshot>;
  onOpen: (sessionId: string) => void;
  renderSlot: RenderSlot;
  t: Translate;
}

export function SessionList({
  workspace,
  pinnedIds,
  archived,
  panelActive,
  longTasks,
  useSessions,
  useSessionStatus,
  onOpen,
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

  const listRef = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(listRef, rows);

  if (workspace === null) return <div className="wb-empty">{t('session.noProject')}</div>;
  if (rows.length === 0) return <div className="wb-empty">{t('session.empty')}</div>;

  return (
    <div
      ref={listRef}
      className={cx('wb-sessions', edges.canScrollUp && 'wb-fadeTop', edges.canScrollDown && 'wb-fadeBottom')}
      role="tree"
      aria-label={t('session.list.label')}
    >
      {rows.map((row) => (
        <SessionRow
          key={row.id}
          node={sessionNode(row, statusById, list, pinned, archivedSet, longTasks.bySession)}
          active={row.id === currentId}
          onOpen={onOpen}
          renderSlot={renderSlot}
          t={t}
        />
      ))}
    </div>
  );
}
